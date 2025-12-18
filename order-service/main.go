package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/streadway/amqp"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// ==============================================================================
// VERİTABANI MODELLERİ
// ==============================================================================

/*
Order: Ana sipariş modeli

💡 YENİ ALANLAR:
  - SubTotal: Kupon öncesi toplam (muhasebe için)
  - CouponCode: Kullanılan kupon kodu ("HOSGELDIN")
  - CouponDiscount: İndirim tutarı (75 TL)
  - ShippingAddress: Teslimat adresi
  - Items: İlişkili ürünler (GORM hasMany)

gorm.Model otomatik ekler:
  - ID (uint)
  - CreatedAt (time.Time)
  - UpdatedAt (time.Time)
  - DeletedAt (soft delete için)
*/
type Order struct {
	gorm.Model
	UserID          uint        `json:"user_id"`
	SubTotal        float64     `json:"sub_total"`       // Kupon ÖNCESİ tutar
	CouponCode      string      `json:"coupon_code"`     // Kullanılan kupon: "HOSGELDIN"
	CouponDiscount  float64     `json:"coupon_discount"` // İndirim tutarı: 75
	TotalPrice      float64     `json:"total_price"`     // Kupon SONRASI tutar
	Status          string      `json:"status" gorm:"default:'Hazırlanıyor'"`
	ShippingAddress string      `json:"shipping_address"`                // Teslimat adresi
	Items           []OrderItem `json:"items" gorm:"foreignKey:OrderID"` // İlişkili ürünler
}

type OrderItem struct {
	gorm.Model
	OrderID      uint    `json:"order_id"`      // Hangi siparişe ait?
	ProductID    uint    `json:"product_id"`    // Ürün ID (referans için)
	ProductName  string  `json:"product_name"`  // O anki ürün adı
	ProductImage string  `json:"product_image"` // O anki ürün resmi
	UnitPrice    float64 `json:"unit_price"`    // O anki birim fiyat
	Quantity     int     `json:"quantity"`      // Adet
	SubTotal     float64 `json:"sub_total"`     // Adet x Fiyat
}

// ==============================================================================
// REQUEST/RESPONSE MODELLERİ (DTO'lar)
// ==============================================================================

/*
DTO (Data Transfer Object) Nedir?

Veritabanı modeli ile API arasında köprü görevi görür.
- Frontend'den gelen veriyi parse eder
- Gereksiz alanları gizler
- Validasyon için kullanılır

Neden ayrı?
- Order struct'ında gorm.Model var (ID, CreatedAt vs.)
- Ama frontend bunları göndermemeli, biz oluşturmalıyız
*/

// CreateOrderRequest: Frontend'den gelen sipariş isteği
type CreateOrderRequest struct {
	UserID     uint             `json:"user_id"`
	Items      []OrderItemInput `json:"items"`       // Sepetteki ürünler
	SubTotal   float64          `json:"sub_total"`   // Kupon öncesi tutar
	TotalPrice float64          `json:"total_price"` // Kupon sonrası tutar

	// Kupon bilgileri (opsiyonel - kupon kullanılmayabilir)
	CouponCode     string  `json:"coupon_code"`
	CouponDiscount float64 `json:"coupon_discount"`

	// Ödeme bilgileri
	CardNumber string `json:"card_number"`
	CVV        string `json:"cvv"`
	Expiry     string `json:"expiry"`

	// Teslimat
	ShippingAddress string `json:"shipping_address"`
}

// OrderItemInput: Sepetten gelen ürün bilgisi
type OrderItemInput struct {
	ProductID    uint    `json:"product_id"`
	ProductName  string  `json:"product_name"`
	ProductImage string  `json:"product_image"`
	UnitPrice    float64 `json:"unit_price"`
	Quantity     int     `json:"quantity"`
}

// UpdateStatusRequest: Admin'den gelen durum güncelleme
type UpdateStatusRequest struct {
	Status string `json:"status"`
}

// OrderEvent: RabbitMQ'ya gönderilecek stok düşürme eventi
type OrderEvent struct {
	Items []struct {
		ProductID int `json:"product_id"`
		Quantity  int `json:"quantity"`
	} `json:"items"`
}

var DB *gorm.DB
var ch *amqp.Channel

// ==============================================================================
// VERİTABANI BAĞLANTISI
// ==============================================================================

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
		log.Fatal("❌ Order Service PostgreSQL'e bağlanılamadı:", err)
	}

	/*
	   AutoMigrate: Her iki tabloyu da oluştur/güncelle

	   ⚠️ DİKKAT: GORM AutoMigrate şunları yapabilir:
	      ✅ Yeni tablo oluşturma
	      ✅ Yeni kolon ekleme
	      ❌ Kolon silme (güvenlik için yapmaz)
	      ❌ Kolon tipi değiştirme

	   Production'da: Flyway, Goose gibi migration tool'ları kullan
	*/
	DB.AutoMigrate(&Order{}, &OrderItem{})
	fmt.Println("✅ Order Service Veritabanına Bağlandı!")
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	initDatabase()

	// RabbitMQ Bağlantısı (RETRY İLE)
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

	// Fanout Exchange tanımla (stok düşürme için)
	err = ch.ExchangeDeclare(
		"order_fanout",
		"fanout",
		true,
		false,
		false,
		false,
		nil,
	)
	failOnError(err, "Exchange oluşturulamadı")

	app := fiber.New()

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
			"service":   "order-service",
			"timestamp": time.Now().Format(time.RFC3339),
			"checks":    checks,
		})
	})

	// ==========================================================================
	// ENDPOINT 1: SİPARİŞ OLUŞTUR (POST /orders)
	// ==========================================================================
	/*
	   Bu endpoint en karmaşık olanı. Adım adım:

	   1. Frontend'den veri al
	   2. Stok kontrolü yap (Product Service'e sor)
	   3. Ödeme al (Payment Service)
	   4. Siparişi kaydet (Order + OrderItems)
	   5. Stok düşür (RabbitMQ ile Product Service'e haber ver)

	   💡 Transaction kullanmıyoruz ama production'da kullanmalısın!
	      DB.Transaction(func(tx *gorm.DB) error { ... })
	*/
	app.Post("/orders", func(c *fiber.Ctx) error {
		productServiceURL := getEnv("PRODUCT_SERVICE_URL", "http://localhost:3001")
		paymentServiceURL := getEnv("PAYMENT_SERVICE_URL", "http://localhost:3005")

		req := new(CreateOrderRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Hatalı veri formatı"})
		}

		// 1. ADIM: STOK KONTROLÜ 🛑
		stockCheckData := map[string]interface{}{
			"items": req.Items,
		}
		stockJSON, _ := json.Marshal(stockCheckData)

		stockRes, err := http.Post(productServiceURL+"/products/validate", "application/json", bytes.NewBuffer(stockJSON))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Ürün servisine ulaşılamadı"})
		}
		defer stockRes.Body.Close()

		// Stok yoksa işlemi durdur!
		if stockRes.StatusCode != 200 {
			var errBody map[string]interface{}
			json.NewDecoder(stockRes.Body).Decode(&errBody)
			return c.Status(400).JSON(errBody) // "Yetersiz Stok..." mesajını döner
		}

		// 2. ADIM: ÖDEME AL 💳
		paymentData := map[string]interface{}{
			"card_number": req.CardNumber,
			"cvv":         req.CVV,
			"expiry":      req.Expiry,
			"amount":      req.TotalPrice,
		}
		paymentJSON, _ := json.Marshal(paymentData)

		paymentRes, err := http.Post(paymentServiceURL+"/pay", "application/json", bytes.NewBuffer(paymentJSON))
		if err != nil || paymentRes.StatusCode != 200 {
			return c.Status(400).JSON(fiber.Map{"error": "Ödeme reddedildi!"})
		}

		// 3. ADIM: SİPARİŞİ KAYDET ✅
		order := Order{
			UserID:          req.UserID,
			SubTotal:        req.SubTotal,
			CouponCode:      req.CouponCode,
			CouponDiscount:  req.CouponDiscount,
			TotalPrice:      req.TotalPrice,
			Status:          "Hazırlanıyor",
			ShippingAddress: req.ShippingAddress,
		}

		// Önce ana siparişi kaydet (ID almak için)
		if result := DB.Create(&order); result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Sipariş kaydedilemedi"})
		}

		// 4. ADIM: SİPARİŞ ÜRÜNLERİNİ KAYDET 📦
		/*
		   Her ürün için OrderItem oluştur ve kaydet.
		   Neden döngüde? Çünkü her ürünün detayını ayrı kaydetmemiz lazım.
		*/
		for _, item := range req.Items {
			orderItem := OrderItem{
				OrderID:      order.ID,
				ProductID:    item.ProductID,
				ProductName:  item.ProductName,
				ProductImage: item.ProductImage,
				UnitPrice:    item.UnitPrice,
				Quantity:     item.Quantity,
				SubTotal:     item.UnitPrice * float64(item.Quantity),
			}
			DB.Create(&orderItem)
		}

		// 5. ADIM: STOK DÜŞÜR (Event Gönder) 📢
		eventItems := make([]struct {
			ProductID int `json:"product_id"`
			Quantity  int `json:"quantity"`
		}, len(req.Items))

		for i, item := range req.Items {
			eventItems[i].ProductID = int(item.ProductID)
			eventItems[i].Quantity = item.Quantity
		}

		eventData := OrderEvent{Items: eventItems}
		messageBody, _ := json.Marshal(eventData)

		ch.Publish("order_fanout", "", false, false, amqp.Publishing{
			ContentType: "application/json",
			Body:        messageBody,
			Timestamp:   time.Now(),
		})

		fmt.Printf("✅ Sipariş oluşturuldu: #%d (Kupon: %s, İndirim: %.2f TL)\n",
			order.ID, order.CouponCode, order.CouponDiscount)

		return c.Status(201).JSON(fiber.Map{
			"message": "Sipariş oluşturuldu",
			"order":   order,
		})
	})

	// ==========================================================================
	// ENDPOINT 2: TÜM SİPARİŞLERİ GETİR - ADMIN (GET /orders) - PAGİNATİON
	// ==========================================================================
	/*
	   🔐 GÜVENLİK NOTU:
	   Bu endpoint TÜM siparişleri döner. Production'da JWT role kontrolü gerekli.

	   Bu endpoint TÜM siparişleri döner. Production'da:
	   1. JWT'den role bilgisini al
	   2. role == "admin" değilse 403 Forbidden dön

	   Şimdilik basit tutuyoruz, ileride middleware ekleriz.

	   💡 Preload("Items") ne yapar?
	      - GORM'da "Eager Loading" (Hevesli Yükleme)
	      - Order'ları çekerken, ilişkili OrderItem'ları da çeker
	      - Tek sorguda tüm veriyi alır (N+1 problemini önler)
	*/
	app.Get("/orders", func(c *fiber.Ctx) error {
		var orders []Order
		var totalItems int64

		// Pagination parametreleri
		page := c.QueryInt("page", 1)
		limit := c.QueryInt("limit", 20)

		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		offset := (page - 1) * limit

		// Base query oluştur (filtreler dahil)
		baseQuery := DB.Model(&Order{})

		// Durum filtresi: ?status=Hazırlanıyor
		if status := c.Query("status"); status != "" {
			baseQuery = baseQuery.Where("status = ?", status)
		}

		// Kullanıcı filtresi: ?user_id=5
		if userID := c.Query("user_id"); userID != "" {
			baseQuery = baseQuery.Where("user_id = ?", userID)
		}

		// Toplam sayıyı hesapla (AYRI QUERY - State pollution'ı önlemek için)
		baseQuery.Count(&totalItems)

		// Sıralama ve pagination uygula (YENİ QUERY)
		result := DB.Model(&Order{}).Preload("Items")

		// Filtreleri tekrar uygula
		if status := c.Query("status"); status != "" {
			result = result.Where("status = ?", status)
		}
		if userID := c.Query("user_id"); userID != "" {
			result = result.Where("user_id = ?", userID)
		}

		// Pagination ve sıralama
		if err := result.Order("created_at desc").Offset(offset).Limit(limit).Find(&orders).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Siparişler çekilemedi"})
		}

		// Pagination meta
		totalPages := int64(0)
		if totalItems > 0 {
			totalPages = (totalItems + int64(limit) - 1) / int64(limit)
		}

		return c.JSON(fiber.Map{
			"orders": orders, // Frontend "orders" bekliyor
			"pagination": fiber.Map{
				"current_page": page,
				"per_page":     limit,
				"total_items":  totalItems,
				"total_pages":  totalPages,
				"has_next":     int64(page) < totalPages,
				"has_prev":     page > 1,
			},
		})
	})

	// ==========================================================================
	// ENDPOINT 3: SİPARİŞ İSTATİSTİKLERİ - ADMIN (GET /orders/stats)
	// ==========================================================================
	/*
	   📌 ÖNEMLİ: Bu route /orders/:id'den ÖNCE tanımlanmalı!
	   Aksi halde "stats" bir ID olarak yorumlanır.

	   Admin dashboard için istatistikler.
	*/
	app.Get("/orders/stats", func(c *fiber.Ctx) error {
		var totalOrders int64
		var totalRevenue float64
		var totalDiscount float64

		DB.Model(&Order{}).Count(&totalOrders)
		DB.Model(&Order{}).Select("COALESCE(SUM(total_price), 0)").Scan(&totalRevenue)
		DB.Model(&Order{}).Select("COALESCE(SUM(coupon_discount), 0)").Scan(&totalDiscount)

		// Bugünkü siparişler
		var todayOrders int64
		today := time.Now().Format("2006-01-02")
		DB.Model(&Order{}).Where("DATE(created_at) = ?", today).Count(&todayOrders)

		return c.JSON(fiber.Map{
			"total_orders":   totalOrders,
			"total_revenue":  totalRevenue,
			"total_discount": totalDiscount,
			"today_orders":   todayOrders,
		})
	})

	// ==========================================================================
	// ENDPOINT 4: KULLANICININ SİPARİŞLERİ (GET /orders/user/:userid) - PAGİNATİON
	// ==========================================================================
	/*
	   Profil sayfasında kullanıcının kendi siparişlerini göstermek için.

	   📝 KULLANIM:
	   GET /orders/user/5?page=1&limit=10

	   💡 Neden ayrı endpoint?
	      - /orders/:id ile çakışmasın diye path farklı
	      - Güvenlik: Kullanıcı sadece kendi siparişlerini görmeli
	*/
	app.Get("/orders/user/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		var orders []Order
		var totalItems int64

		// Pagination
		page := c.QueryInt("page", 1)
		limit := c.QueryInt("limit", 10) // Profil sayfası için default 10

		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 50 {
			limit = 10
		}
		offset := (page - 1) * limit

		query := DB.Model(&Order{}).Preload("Items").Where("user_id = ?", userid)

		// Toplam sayı
		query.Count(&totalItems)

		// Veriyi çek
		result := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&orders)
		if result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Siparişler çekilemedi"})
		}

		// Pagination meta
		totalPages := int64(0)
		if totalItems > 0 {
			totalPages = (totalItems + int64(limit) - 1) / int64(limit)
		}

		return c.JSON(fiber.Map{
			"orders": orders, // Frontend "orders" bekliyor
			"pagination": fiber.Map{
				"current_page": page,
				"per_page":     limit,
				"total_items":  totalItems,
				"total_pages":  totalPages,
				"has_next":     int64(page) < totalPages,
				"has_prev":     page > 1,
			},
		})
	})

	// ==========================================================================
	// ENDPOINT 5: SİPARİŞ DETAYI (GET /orders/:id)
	// ==========================================================================
	/*
	   Tek bir siparişin tüm detaylarını döner.
	   Kullanım: /orders/[id] sayfası için

	   First vs Find:
	   - Find: Birden fazla kayıt döner (slice)
	   - First: Tek kayıt döner, yoksa hata verir

	   Preload("Items"): Siparişteki ürünleri de getir
	*/
	app.Get("/orders/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var order Order

		result := DB.Preload("Items").First(&order, id)
		if result.Error != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Sipariş bulunamadı"})
		}

		return c.JSON(order)
	})

	// ==========================================================================
	// ENDPOINT 5: SİPARİŞ DURUMU GÜNCELLE - ADMIN (PATCH /orders/:id/status)
	// ==========================================================================
	/*
	   Admin panelinden sipariş durumunu günceller.

	   Durumlar:
	   - Hazırlanıyor: Sipariş alındı, paketleniyor
	   - Kargolandı: Kargo firmasına teslim edildi
	   - Teslim Edildi: Müşteriye ulaştı
	   - İptal Edildi: Sipariş iptal edildi

	   💡 SENIOR NOTU:
	   Burada RabbitMQ'ya "order.status.changed" eventi atılabilir.
	   Notification Service bu eventi dinleyip müşteriye email/SMS atabilir.

	   Örnek:
	   ch.Publish("order_events", "order.status.changed", ...)
	*/
	app.Patch("/orders/:id/status", func(c *fiber.Ctx) error {
		id := c.Params("id")

		req := new(UpdateStatusRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Hatalı veri"})
		}

		var order Order
		if err := DB.First(&order, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Sipariş bulunamadı"})
		}

		oldStatus := order.Status
		order.Status = req.Status
		DB.Save(&order)

		fmt.Printf("📦 Sipariş #%s durumu: %s → %s\n", id, oldStatus, req.Status)

		return c.JSON(fiber.Map{
			"message": "Durum güncellendi",
			"order":   order,
		})
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
