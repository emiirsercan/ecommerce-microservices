package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/adaptor/v2" // Standart handler çevirici
	jwtware "github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/streadway/amqp"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB
var ch *amqp.Channel

const SecretKey = "benim_cok_gizli_anahtarim_senior_oluyorum"

// --- METRİKLER ---
var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Toplam HTTP istek sayısı",
		},
		[]string{"method", "path", "status", "service"},
	)
)

// Stok kontrolü için gelen istek modeli
type StockCheckReq struct {
	Items []struct {
		ProductID int `json:"product_id"`
		Quantity  int `json:"quantity"`
	} `json:"items"`
}

type Product struct {
	gorm.Model
	Name  string `json:"name"`
	Code  string `json:"code"`
	Price uint   `json:"price"`
	Stock int    `json:"stock"`
}

type OrderItem struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

type OrderEvent struct {
	Items []OrderItem `json:"items"` // Artık sadece ID değil, adet de taşıyoruz
}

func initDatabase() {
	var err error
	dsn := "host=localhost user=user password=password dbname=ecommerce port=5432 sslmode=disable"
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("DB Hatası: ", err)
	}
	fmt.Println("🚀 Product DB Bağlandı!")
	DB.AutoMigrate(&Product{})
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	initDatabase()

	// --- RABBITMQ BAĞLANTISI ---
	conn, err := amqp.Dial("amqp://guest:guest@localhost:5672/")
	failOnError(err, "RabbitMQ'ya bağlanılamadı")
	defer conn.Close()

	ch, err = conn.Channel()
	failOnError(err, "Kanal açılamadı")
	defer ch.Close()

	// 1. Ürün Eklendiğinde Haber Verilecek Kuyruk (Producer - Search Service için)
	qProduct, err := ch.QueueDeclare("product_created", false, false, false, false, nil)
	failOnError(err, "Ürün kuyruğu hatası")

	// 2. EXCHANGE TANIMLAMA (Consumer - Siparişleri Dinlemek İçin)
	// Order Service ile aynı ismi kullanmalıyız: "order_fanout"
	err = ch.ExchangeDeclare("order_fanout", "fanout", true, false, false, false, nil)
	failOnError(err, "Exchange hatası")

	// 3. KENDİNE ÖZEL KUYRUK OLUŞTUR
	qStock, err := ch.QueueDeclare(
		"stock_queue", // Product Service'e özel kuyruk adı
		true, false, false, false, nil,
	)
	failOnError(err, "Stok kuyruğu hatası")

	// 4. KUYRUĞU EXCHANGE'E BAĞLA (BIND)
	// Santrale gelen mesajların bir kopyası da buraya düşsün
	err = ch.QueueBind(qStock.Name, "", "order_fanout", false, nil)
	failOnError(err, "Bind hatası")

	// 5. DİNLEMEYE BAŞLA
	msgs, err := ch.Consume(qStock.Name, "", true, false, false, false, nil)
	failOnError(err, "Consumer başlatılamadı")

	// --- ARKA PLAN İŞÇİSİ: STOK DÜŞME ---
	go func() {
		fmt.Println("🎧 Product Service: Stok güncellemek için siparişleri dinliyor...")
		for d := range msgs {
			var orderEvent OrderEvent
			json.Unmarshal(d.Body, &orderEvent)

			fmt.Printf("📦 Sipariş Yakalandı! Stoklar güncelleniyor...\n")

			// Adetli düşüş yap
			for _, item := range orderEvent.Items {
				DB.Model(&Product{}).Where("id = ?", item.ProductID).UpdateColumn("stock", gorm.Expr("stock - ?", item.Quantity))
			}
		}
	}()

	// --- WEB SUNUCUSU ---
	app := fiber.New()

	// --- PROMETHEUS MIDDLEWARE (MANUEL) ---
	app.Use(func(c *fiber.Ctx) error {
		err := c.Next()
		httpRequestsTotal.WithLabelValues(
			c.Method(),
			c.Path(),
			strconv.Itoa(c.Response().StatusCode()),
			"product-service",
		).Inc()
		return err
	})
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	// CORS
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// ROTALAR
	app.Get("/products", func(c *fiber.Ctx) error {
		var products []Product
		DB.Find(&products)
		return c.JSON(products)
	})

	app.Get("/products/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var product Product
		if err := DB.First(&product, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Bulunamadı"})
		}
		return c.JSON(product)
	})
	// --- STOK KONTROLÜ (Senkron) ---
	app.Post("/products/validate", func(c *fiber.Ctx) error {
		req := new(StockCheckReq)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri formatı hatalı"})
		}

		for _, item := range req.Items {
			var product Product
			// Ürünü bul
			if err := DB.First(&product, item.ProductID).Error; err != nil {
				return c.Status(404).JSON(fiber.Map{"error": fmt.Sprintf("Ürün bulunamadı: ID %d", item.ProductID)})
			}

			// Stok Yetersiz mi?
			if product.Stock < item.Quantity {
				return c.Status(400).JSON(fiber.Map{
					"error": fmt.Sprintf("Yetersiz Stok: %s (Kalan: %d, İstenen: %d)", product.Name, product.Stock, item.Quantity),
				})
			}
		}

		// Her şey yolunda
		return c.Status(200).JSON(fiber.Map{"message": "Stok uygun"})
	})

	app.Use(jwtware.New(jwtware.Config{
		SigningKey: jwtware.SigningKey{Key: []byte(SecretKey)},
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Giriş yapmanız gerekiyor!"})
		},
	}))

	app.Post("/products", func(c *fiber.Ctx) error {
		product := new(Product)
		if err := c.BodyParser(product); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		if result := DB.Create(&product); result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "DB Kayıt Hatası"})
		}

		// Yeni ürün eklendi eventini fırlat (Search Service için)
		// Burası direkt kuyruğa atıyor, Search Service de o kuyruğu dinliyor.
		messageBody, _ := json.Marshal(product)
		ch.Publish("", qProduct.Name, false, false, amqp.Publishing{
			ContentType: "application/json", Body: messageBody, Timestamp: time.Now(),
		})

		return c.Status(201).JSON(product)
	})

	log.Fatal(app.Listen(":3001"))
}
