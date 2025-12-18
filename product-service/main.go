package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
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

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

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

// --- KATEGORİ MODELİ ---
type Category struct {
	gorm.Model
	Name     string `json:"name"`
	Slug     string `json:"slug" gorm:"unique"` // URL-friendly: "telefonlar", "bilgisayarlar"
	ParentID *uint  `json:"parent_id"`          // Alt kategoriler için (nullable)
	Icon     string `json:"icon"`               // Lucide icon adı: "smartphone", "laptop"
}

type Product struct {
	gorm.Model
	Name       string    `json:"name"`
	Code       string    `json:"code"`
	Price      uint      `json:"price"`
	Stock      int       `json:"stock"`
	CategoryID *uint     `json:"category_id"`                           // Kategori ID (nullable)
	Category   *Category `json:"category" gorm:"foreignKey:CategoryID"` // İlişki
}

type OrderItem struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

type OrderEvent struct {
	Items []OrderItem `json:"items"` // Artık sadece ID değil, adet de taşıyoruz
}

func initDatabase() {
	dbHost := getEnv("DB_HOST", "localhost")
	dbUser := getEnv("DB_USER", "user")
	dbPass := getEnv("DB_PASSWORD", "password")
	dbName := getEnv("DB_NAME", "ecommerce")
	dbPort := getEnv("DB_PORT", "5432")

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable", dbHost, dbUser, dbPass, dbName, dbPort)

	// PostgreSQL bağlantısı için retry mantığı
	var err error
	maxRetries := 30
	for i := 0; i < maxRetries; i++ {
		DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("⏳ PostgreSQL bağlantı bekleniyor... (%d/%d)", i+1, maxRetries)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("❌ PostgreSQL'e bağlanılamadı: ", err)
	}
	fmt.Println("✅ Product DB Bağlandı!")

	// Önce Category, sonra Product (Foreign Key ilişkisi için)
	DB.AutoMigrate(&Category{}, &Product{})

	// Varsayılan kategorileri oluştur (eğer yoksa)
	seedCategories()
}

// Varsayılan kategorileri oluşturur
func seedCategories() {
	categories := []Category{
		{Name: "Elektronik", Slug: "elektronik", Icon: "laptop"},
		{Name: "Telefonlar", Slug: "telefonlar", Icon: "smartphone"},
		{Name: "Bilgisayarlar", Slug: "bilgisayarlar", Icon: "monitor"},
		{Name: "Kulaklıklar", Slug: "kulakliklar", Icon: "headphones"},
		{Name: "Aksesuarlar", Slug: "aksesuarlar", Icon: "watch"},
		{Name: "Oyun", Slug: "oyun", Icon: "gamepad-2"},
	}

	for _, cat := range categories {
		// Slug'a göre var mı kontrol et, yoksa ekle
		var existing Category
		if DB.Where("slug = ?", cat.Slug).First(&existing).Error != nil {
			DB.Create(&cat)
			fmt.Printf("📁 Kategori oluşturuldu: %s\n", cat.Name)
		}
	}
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	initDatabase()

	// --- RABBITMQ BAĞLANTISI (RETRY İLE) ---
	rabbitURL := getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

	var conn *amqp.Connection
	var err error
	maxRetries := 30
	for i := 0; i < maxRetries; i++ {
		conn, err = amqp.Dial(rabbitURL)
		if err == nil {
			break
		}
		log.Printf("⏳ RabbitMQ bağlantı bekleniyor... (%d/%d)", i+1, maxRetries)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("❌ RabbitMQ'ya bağlanılamadı: %s", err)
	}
	fmt.Println("✅ RabbitMQ Bağlantısı Başarılı!")
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

	// ==============================================================================
	// HEALTH CHECK ENDPOINT
	// ==============================================================================
	app.Get("/health", func(c *fiber.Ctx) error {
		checks := make(map[string]interface{})
		status := "healthy"

		// PostgreSQL kontrolü
		sqlDB, err := DB.DB()
		if err != nil {
			checks["postgres"] = map[string]string{"status": "unhealthy", "message": err.Error()}
			status = "unhealthy"
		} else if err := sqlDB.Ping(); err != nil {
			checks["postgres"] = map[string]string{"status": "unhealthy", "message": err.Error()}
			status = "unhealthy"
		} else {
			checks["postgres"] = map[string]string{"status": "healthy", "message": "connection OK"}
		}

		// RabbitMQ kontrolü
		if ch == nil {
			checks["rabbitmq"] = map[string]string{"status": "unhealthy", "message": "channel is nil"}
			status = "unhealthy"
		} else {
			checks["rabbitmq"] = map[string]string{"status": "healthy", "message": "connection OK"}
		}

		statusCode := 200
		if status != "healthy" {
			statusCode = 503
		}

		return c.Status(statusCode).JSON(fiber.Map{
			"status":    status,
			"service":   "product-service",
			"timestamp": time.Now().Format(time.RFC3339),
			"checks":    checks,
		})
	})

	// =====================
	// KATEGORİ ENDPOINT'LERİ
	// =====================

	// Tüm kategorileri getir
	app.Get("/categories", func(c *fiber.Ctx) error {
		var categories []Category
		DB.Find(&categories)
		return c.JSON(categories)
	})

	// Tek kategori getir (slug ile)
	app.Get("/categories/:slug", func(c *fiber.Ctx) error {
		slug := c.Params("slug")
		var category Category
		if err := DB.Where("slug = ?", slug).First(&category).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kategori bulunamadı"})
		}
		return c.JSON(category)
	})

	// =====================
	// ÜRÜN ENDPOINT'LERİ
	// =====================

	/*
	   =====================================================================
	   ÜRÜN LİSTESİ - PAGİNATİON DESTEKLİ
	   =====================================================================

	   💡 PAGİNATİON NEDİR?

	      Veritabanında 10.000 ürün var diyelim.
	      Hepsini tek seferde çekmek:
	      - Yavaş (10 saniye)
	      - Hafıza tüketir (100MB+)
	      - Frontend donar

	      Pagination ile:
	      - Sadece 20 ürün çek (200ms)
	      - Hafıza az kullanılır (500KB)
	      - Frontend akıcı çalışır

	   📝 KULLANIM:
	      GET /products?page=1&limit=20
	      GET /products?page=2&limit=20&category=5&sort=price_asc

	   📤 RESPONSE FORMAT:
	      {
	        "data": [...products],
	        "pagination": {
	          "current_page": 1,
	          "per_page": 20,
	          "total_items": 150,
	          "total_pages": 8,
	          "has_next": true,
	          "has_prev": false
	        }
	      }
	*/
	app.Get("/products", func(c *fiber.Ctx) error {
		var products []Product
		var totalItems int64

		// =================================================================
		// 1. PAGİNATİON PARAMETRELERİ
		// =================================================================
		/*
		   QueryInt: String'i int'e çevirir, hata olursa default değer döner

		   page=1 → İlk sayfa
		   limit=20 → Sayfa başına 20 ürün (max 100 - güvenlik için)

		   Offset hesaplama:
		   page=1 → offset=0  (ilk 20 ürün)
		   page=2 → offset=20 (21-40 arası)
		   page=3 → offset=40 (41-60 arası)

		   Formül: offset = (page - 1) * limit
		*/
		page := c.QueryInt("page", 1)
		limit := c.QueryInt("limit", 20)

		// Güvenlik: Negatif değerleri engelle
		if page < 1 {
			page = 1
		}
		if limit < 1 {
			limit = 20
		}
		if limit > 100 {
			limit = 100 // Max 100 - Biri ?limit=999999 yazmasın diye
		}

		offset := (page - 1) * limit

		// =================================================================
		// 2. FİLTRELEME (Count için)
		// =================================================================
		// Helper: Filtreleri bir query'ye uygula
		applyFilters := func(q *gorm.DB) *gorm.DB {
			// ?category=5 → Kategoriye göre filtrele
			if categoryID := c.Query("category"); categoryID != "" {
				q = q.Where("category_id = ?", categoryID)
			}
			// ?min=100&max=500 → Fiyat aralığı
			if minPrice := c.Query("min"); minPrice != "" {
				q = q.Where("price >= ?", minPrice)
			}
			if maxPrice := c.Query("max"); maxPrice != "" {
				q = q.Where("price <= ?", maxPrice)
			}
			// ?stock=true → Sadece stokta olanlar
			if inStock := c.Query("stock"); inStock == "true" {
				q = q.Where("stock > 0")
			}
			// ?search=iphone → İsimde ara
			if search := c.Query("search"); search != "" {
				q = q.Where("name ILIKE ?", "%"+search+"%")
			}
			return q
		}

		// =================================================================
		// 3. TOPLAM SAYIYI HESAPLA (AYRI QUERY)
		// =================================================================
		countQuery := applyFilters(DB.Model(&Product{}))
		countQuery.Count(&totalItems)

		// =================================================================
		// 4. VERİYİ ÇEK (YENİ QUERY)
		// =================================================================
		dataQuery := applyFilters(DB.Model(&Product{}).Preload("Category"))

		// Sıralama
		sort := c.Query("sort")
		switch sort {
		case "price_asc":
			dataQuery = dataQuery.Order("price ASC")
		case "price_desc":
			dataQuery = dataQuery.Order("price DESC")
		case "newest":
			dataQuery = dataQuery.Order("created_at DESC")
		case "oldest":
			dataQuery = dataQuery.Order("created_at ASC")
		default:
			dataQuery = dataQuery.Order("created_at DESC")
		}

		// Pagination uygula
		dataQuery.Offset(offset).Limit(limit).Find(&products)

		// =================================================================
		// 5. PAGİNATİON META VERİSİ HESAPLA
		// =================================================================
		totalPages := int64(0)
		if totalItems > 0 {
			totalPages = (totalItems + int64(limit) - 1) / int64(limit)
		}

		hasNext := int64(page) < totalPages
		hasPrev := page > 1

		// =================================================================
		// 6. RESPONSE
		// =================================================================
		return c.JSON(fiber.Map{
			"products": products, // Frontend "products" bekliyor
			"pagination": fiber.Map{
				"current_page": page,
				"per_page":     limit,
				"total_items":  totalItems,
				"total_pages":  totalPages,
				"has_next":     hasNext,
				"has_prev":     hasPrev,
			},
		})
	})

	// Tek ürün getir
	app.Get("/products/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var product Product
		if err := DB.Preload("Category").First(&product, id).Error; err != nil {
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
	// --- SENKRONİZASYON ENDPOINT'İ (YENİ) ---
	// Kullanımı: POST http://localhost:3001/products/sync
	app.Post("/products/sync", func(c *fiber.Ctx) error {
		// 1. Tüm ürünleri DB'den çek
		var products []Product
		if result := DB.Find(&products); result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Veritabanından ürünler okunamadı"})
		}

		fmt.Printf("🔄 Senkronizasyon Başladı! Toplam %d ürün aktarılacak...\n", len(products))

		// 2. Her bir ürünü RabbitMQ'ya gönder
		successCount := 0
		for _, p := range products {
			messageBody, _ := json.Marshal(p)

			// 'product_created' kuyruğuna atıyoruz (Search Service bunu dinliyor)
			err := ch.Publish(
				"",                // Exchange (Boş bırakıyoruz, direkt kuyruğa)
				"product_created", // Routing Key (Kuyruk Adı)
				false,
				false,
				amqp.Publishing{
					ContentType: "application/json",
					Body:        messageBody,
					Timestamp:   time.Now(),
				})

			if err != nil {
				fmt.Printf("❌ Hata (%s): %s\n", p.Name, err)
			} else {
				fmt.Printf("📤 Gönderildi: %s\n", p.Name)
				successCount++
			}
		}

		return c.JSON(fiber.Map{
			"message":      "Senkronizasyon tamamlandı",
			"total_found":  len(products),
			"total_synced": successCount,
		})
	})

	app.Use(jwtware.New(jwtware.Config{
		SigningKey: jwtware.SigningKey{Key: []byte(SecretKey)},
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Giriş yapmanız gerekiyor!"})
		},
	}))

	// Yeni ürün ekle
	app.Post("/products", func(c *fiber.Ctx) error {
		product := new(Product)
		if err := c.BodyParser(product); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		// Kategori ID verilmişse, var mı kontrol et
		if product.CategoryID != nil {
			var category Category
			if err := DB.First(&category, *product.CategoryID).Error; err != nil {
				return c.Status(400).JSON(fiber.Map{"error": "Geçersiz kategori ID"})
			}
		}

		if result := DB.Create(&product); result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "DB Kayıt Hatası"})
		}

		// Kategori bilgisini de yükle
		DB.Preload("Category").First(&product, product.ID)

		// Yeni ürün eklendi eventini fırlat (Search Service için)
		messageBody, _ := json.Marshal(product)
		ch.Publish("", qProduct.Name, false, false, amqp.Publishing{
			ContentType: "application/json", Body: messageBody, Timestamp: time.Now(),
		})

		return c.Status(201).JSON(product)
	})

	// Ürün güncelle (PUT)
	app.Put("/products/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var product Product
		if err := DB.First(&product, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Ürün bulunamadı"})
		}

		// Gelen veriyi parse et
		var updateData Product
		if err := c.BodyParser(&updateData); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		// Kategori ID verilmişse, var mı kontrol et
		if updateData.CategoryID != nil {
			var category Category
			if err := DB.First(&category, *updateData.CategoryID).Error; err != nil {
				return c.Status(400).JSON(fiber.Map{"error": "Geçersiz kategori ID"})
			}
		}

		// Güncelle
		DB.Model(&product).Updates(updateData)
		DB.Preload("Category").First(&product, id)

		return c.JSON(product)
	})

	// Ürün sil (DELETE)
	app.Delete("/products/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var product Product
		if err := DB.First(&product, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Ürün bulunamadı"})
		}

		// Soft delete (GORM varsayılan olarak soft delete yapar - deleted_at alanını doldurur)
		if err := DB.Delete(&product).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Ürün silinemedi"})
		}

		fmt.Printf("🗑️ Ürün silindi: %s (ID: %s)\n", product.Name, id)

		return c.JSON(fiber.Map{"message": "Ürün başarıyla silindi", "deleted_id": id})
	})

	log.Fatal(app.Listen(":3001"))
}
