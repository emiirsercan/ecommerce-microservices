package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/lib/pq"
	"github.com/streadway/amqp"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type OrderItem struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

// Frontend'den gelecek istek modeli
type CreateOrderRequest struct {
	UserID     int         `json:"user_id"`
	Items      []OrderItem `json:"items"`
	TotalPrice float64     `json:"total_price"`
	CardNumber string      `json:"card_number"`
	CVV        string      `json:"cvv"`
	Expiry     string      `json:"expiry"`
}

// Veritabanı Modeli
type Order struct {
	gorm.Model
	ProductIDs pq.Int64Array `json:"product_ids" gorm:"type:integer[]"`
	UserID     int           `json:"user_id"`
	TotalPrice float64       `json:"total_price"`
	Status     string        `json:"status" gorm:"default:'Hazırlanıyor'"`
}

// RabbitMQ'ya atılacak mesaj (Product Service ile uyumlu olmalı)
type OrderEvent struct {
	Items []OrderItem `json:"items"`
}

var DB *gorm.DB
var ch *amqp.Channel

// var q amqp.Queue  <--Bunu sildik, artık Exchange kullanacağız

func initDatabase() {
	dsn := "host=localhost user=user password=password dbname=ecommerce port=5432 sslmode=disable"
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("DB Hatası:", err)
	}
	DB.AutoMigrate(&Order{})
	fmt.Println("🚀 Order DB Bağlandı")
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	initDatabase()

	// RabbitMQ Bağlantısı
	conn, err := amqp.Dial("amqp://guest:guest@localhost:5672/")
	failOnError(err, "RabbitMQ'ya bağlanılamadı")
	defer conn.Close()

	ch, err = conn.Channel()
	failOnError(err, "Kanal açılamadı")
	defer ch.Close()

	// --- DEĞİŞİKLİK 1: KUYRUK YERİNE EXCHANGE TANIMLIYORUZ ---
	// "order_fanout" adında bir santral kuruyoruz. Tipi: "fanout" (Herkese yay)
	err = ch.ExchangeDeclare(
		"order_fanout", // Exchange Adı
		"fanout",       // Tipi (Yayın yap)
		true,           // Durable (Kalıcı)
		false,          // Auto-deleted
		false,          // Internal
		false,          // No-wait
		nil,            // Arguments
	)
	failOnError(err, "Exchange oluşturulamadı")

	app := fiber.New()

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	app.Post("/orders", func(c *fiber.Ctx) error {
		req := new(CreateOrderRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Hatalı veri formatı"})
		}

		// 1. ADIM: STOK KONTROLÜ (Product Service'e Sor) 🛑
		stockCheckData := map[string]interface{}{
			"items": req.Items,
		}
		stockJSON, _ := json.Marshal(stockCheckData)

		// Product Service (3001) validate endpointine istek at
		stockRes, err := http.Post("http://localhost:3001/products/validate", "application/json", bytes.NewBuffer(stockJSON))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Ürün servisine ulaşılamadı"})
		}
		defer stockRes.Body.Close()

		// Stok yoksa işlemi durdur!
		if stockRes.StatusCode != 200 {
			// Product service'den gelen detaylı hata mesajını oku ve kullanıcıya ilet
			var errBody map[string]interface{}
			json.NewDecoder(stockRes.Body).Decode(&errBody)
			return c.Status(400).JSON(errBody) // "Yetersiz Stok..." mesajını döner
		}

		// 2. ADIM: ÖDEME AL (Payment Service) 💳
		paymentData := map[string]interface{}{
			"card_number": req.CardNumber,
			"cvv":         req.CVV,
			"expiry":      req.Expiry,
			"amount":      req.TotalPrice,
		}
		paymentJSON, _ := json.Marshal(paymentData)

		paymentRes, err := http.Post("http://localhost:3005/pay", "application/json", bytes.NewBuffer(paymentJSON))
		if err != nil || paymentRes.StatusCode != 200 {
			return c.Status(400).JSON(fiber.Map{"error": "Ödeme reddedildi!"})
		}

		// 3. ADIM: SİPARİŞİ KAYDET ✅
		// (DB için ID listesi lazım, basitçe ID'leri toplayalım)
		var productIDs []int64
		for _, item := range req.Items {
			productIDs = append(productIDs, int64(item.ProductID))
		}

		order := Order{
			UserID:     req.UserID,
			ProductIDs: pq.Int64Array(productIDs), // DB'de sadece ID'leri tutmaya devam edelim şimdilik
			TotalPrice: req.TotalPrice,
			Status:     "Hazırlanıyor",
		}

		if result := DB.Create(&order); result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "DB Kayıt Hatası"})
		}

		// 4. ADIM: STOK DÜŞMEK İÇİN HABER VER 📢
		// Product Service'in beklediği formatta (adetli) gönderiyoruz
		eventData := OrderEvent{Items: req.Items}
		messageBody, _ := json.Marshal(eventData)

		ch.Publish("order_fanout", "", false, false, amqp.Publishing{
			ContentType: "application/json", Body: messageBody, Timestamp: time.Now(),
		})

		return c.Status(201).JSON(fiber.Map{"message": "Sipariş alındı", "order": order})
	})

	// 2. Siparişleri Getir
	app.Get("/orders/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		var orders []Order
		result := DB.Where("user_id = ?", userid).Order("created_at desc").Find(&orders)
		if result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Siparişler çekilemedi"})
		}
		return c.JSON(orders)
	})

	log.Fatal(app.Listen(":3004"))
}

func convertToInt64(ints []int) []int64 {
	var res []int64
	for _, i := range ints {
		res = append(res, int64(i))
	}
	return res
}
