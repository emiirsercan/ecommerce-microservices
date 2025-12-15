package main

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ==============================================================================
// VERİTABANI BAĞLANTISI
// ==============================================================================

var DB *gorm.DB

func initDatabase() {
	dsn := "host=localhost user=user password=password dbname=ecommerce port=5432 sslmode=disable"

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("❌ Veritabanına bağlanılamadı:", err)
	}

	DB.AutoMigrate(&Coupon{}, &CouponUsage{})

	fmt.Println("🎟️ Coupon Service Veritabanına Bağlandı!")

	// Örnek kuponları oluştur (Demo için)
	seedCoupons()
}

// ==============================================================================
// VERİ MODELLERİ (DOMAIN ENTITIES)
// ==============================================================================

type Coupon struct {
	gorm.Model
	Code           string    `json:"code" gorm:"uniqueIndex;size:50"` // Kupon kodu: "YUZDE10"
	Description    string    `json:"description"`                     // Açıklama: "Yeni üyelere özel"
	DiscountType   string    `json:"discount_type"`                   // "percentage" veya "fixed"
	DiscountValue  float64   `json:"discount_value"`                  // 10 (yüzde) veya 50 (TL)
	MinOrderAmount float64   `json:"min_order_amount"`                // Minimum sepet tutarı
	MaxUses        int       `json:"max_uses"`                        // Maksimum kullanım sayısı
	UsedCount      int       `json:"used_count" gorm:"default:0"`     // Kullanılan sayı
	StartDate      time.Time `json:"start_date"`                      // Başlangıç tarihi
	EndDate        time.Time `json:"end_date"`                        // Bitiş tarihi
	IsActive       bool      `json:"is_active" gorm:"default:true"`   // Aktif mi?
}

type CouponUsage struct {
	gorm.Model
	UserID   uint    `json:"user_id"`
	CouponID uint    `json:"coupon_id"`
	OrderID  uint    `json:"order_id"`
	Discount float64 `json:"discount"` // Uygulanan indirim tutarı
}

// ==============================================================================
// İSTEK/YANIT MODELLERİ (DTOs - Data Transfer Objects)
// ==============================================================================

// ApplyCouponRequest: Kupon uygulama isteği
type ApplyCouponRequest struct {
	Code       string  `json:"code"`        // Kupon kodu
	UserID     uint    `json:"user_id"`     // Kim kullanıyor?
	OrderTotal float64 `json:"order_total"` // Sepet tutarı
}

// ApplyCouponResponse: Kupon uygulama yanıtı
type ApplyCouponResponse struct {
	Valid        bool    `json:"valid"`         // Kupon geçerli mi?
	Message      string  `json:"message"`       // Açıklama
	DiscountType string  `json:"discount_type"` // percentage / fixed
	Discount     float64 `json:"discount"`      // İndirim tutarı (hesaplanmış)
	NewTotal     float64 `json:"new_total"`     // İndirim sonrası tutar
	CouponID     uint    `json:"coupon_id"`     // Kupon ID (kayıt için)
}

// ==============================================================================
// DEMO VERİLERİ
// ==============================================================================

func seedCoupons() {
	/*
	   Seed Data: Geliştirme/test için örnek veriler

	   ⚠️ Production'da bu fonksiyon olmamalı veya bir kez çalışmalı
	   Genelde migration script'lerinde yapılır
	*/

	coupons := []Coupon{
		{
			Code:           "HOSGELDIN",
			Description:    "Yeni üyelere özel %15 indirim",
			DiscountType:   "percentage",
			DiscountValue:  15,
			MinOrderAmount: 100,
			MaxUses:        1000,
			StartDate:      time.Now(),
			EndDate:        time.Now().AddDate(1, 0, 0), // 1 yıl geçerli
			IsActive:       true,
		},
		{
			Code:           "YAZ2024",
			Description:    "Yaz kampanyası - 50 TL indirim",
			DiscountType:   "fixed",
			DiscountValue:  50,
			MinOrderAmount: 200,
			MaxUses:        500,
			StartDate:      time.Now(),
			EndDate:        time.Now().AddDate(0, 3, 0), // 3 ay geçerli
			IsActive:       true,
		},
		{
			Code:           "SUPER100",
			Description:    "Süper indirim - 100 TL",
			DiscountType:   "fixed",
			DiscountValue:  100,
			MinOrderAmount: 500,
			MaxUses:        100,
			StartDate:      time.Now(),
			EndDate:        time.Now().AddDate(0, 1, 0), // 1 ay geçerli
			IsActive:       true,
		},
	}

	for _, coupon := range coupons {
		// Zaten varsa ekleme (Code unique olduğu için hata verir)
		var existing Coupon
		if DB.Where("code = ?", coupon.Code).First(&existing).Error != nil {
			DB.Create(&coupon)
			fmt.Printf("🎫 Kupon oluşturuldu: %s\n", coupon.Code)
		}
	}
}

// ==============================================================================
// İŞ MANTIĞI (BUSINESS LOGIC)
// ==============================================================================

/*
validateCoupon: Kuponun geçerliliğini kontrol eder

Bu fonksiyon Single Responsibility Principle (SRP) örneğidir:
- Sadece validasyon yapar
- Veritabanına yazmaz
- HTTP'den bağımsız (test edilebilir)

Kontrol sırası önemli:
1. Kupon var mı?
2. Aktif mi?
3. Tarih aralığında mı?
4. Kullanım limiti doldu mu?
5. Minimum tutar sağlanıyor mu?
6. Bu kullanıcı daha önce kullandı mı?
*/
func validateCoupon(code string, userID uint, orderTotal float64) (*Coupon, string, bool) {
	// 1. Kuponu bul (case-insensitive arama)
	var coupon Coupon
	if err := DB.Where("UPPER(code) = ?", strings.ToUpper(code)).First(&coupon).Error; err != nil {
		return nil, "Kupon kodu bulunamadı", false
	}

	// 2. Aktif mi?
	if !coupon.IsActive {
		return nil, "Bu kupon artık geçerli değil", false
	}

	// 3. Tarih kontrolü
	now := time.Now()
	if now.Before(coupon.StartDate) {
		return nil, "Bu kupon henüz aktif değil", false
	}
	if now.After(coupon.EndDate) {
		return nil, "Bu kuponun süresi dolmuş", false
	}

	// 4. Kullanım limiti
	if coupon.UsedCount >= coupon.MaxUses {
		return nil, "Bu kupon kullanım limitine ulaştı", false
	}

	// 5. Minimum tutar
	if orderTotal < coupon.MinOrderAmount {
		return nil, fmt.Sprintf("Bu kupon minimum %.0f TL alışverişlerde geçerlidir", coupon.MinOrderAmount), false
	}

	// 6. Bu kullanıcı daha önce kullandı mı?
	var usage CouponUsage
	if err := DB.Where("user_id = ? AND coupon_id = ?", userID, coupon.ID).First(&usage).Error; err == nil {
		return nil, "Bu kuponu daha önce kullandınız", false
	}

	return &coupon, "Kupon geçerli!", true
}

/*
calculateDiscount: İndirim tutarını hesaplar

💡 Neden ayrı fonksiyon?
- Test edilebilirlik: Sadece matematiksel işlem
- Yeniden kullanılabilirlik: Farklı yerlerden çağrılabilir
- Okunabilirlik: Ana fonksiyon daha temiz kalır
*/
func calculateDiscount(coupon *Coupon, orderTotal float64) float64 {
	var discount float64

	if coupon.DiscountType == "percentage" {
		// Yüzdelik indirim: 1000 TL * %15 = 150 TL
		discount = orderTotal * (coupon.DiscountValue / 100)
	} else {
		// Sabit indirim: 50 TL (sepetten düşülür)
		discount = coupon.DiscountValue
	}

	// İndirim sepet tutarını geçemez (negatif tutar olmasın)
	if discount > orderTotal {
		discount = orderTotal
	}

	return discount
}

// ==============================================================================
// ANA FONKSİYON VE HTTP SUNUCUSU
// ==============================================================================

func main() {
	initDatabase()

	app := fiber.New()

	// CORS: Cross-Origin Resource Sharing
	// Frontend (localhost:3000) Backend'e (localhost:3010) istek atabilsin
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, DELETE, PATCH, OPTIONS",
	}))

	// --- 1. TÜM KUPONLARI LİSTELE (Admin için) - PAGİNATİON ---
	/*
	   📝 KULLANIM:
	   GET /coupons?page=1&limit=20
	   GET /coupons?page=1&limit=20&active=true (sadece aktifler)
	*/
	app.Get("/coupons", func(c *fiber.Ctx) error {
		var coupons []Coupon
		var totalItems int64

		// Pagination
		page := c.QueryInt("page", 1)
		limit := c.QueryInt("limit", 20)

		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		offset := (page - 1) * limit

		query := DB.Model(&Coupon{})

		// Sadece aktif kuponlar: ?active=true
		if active := c.Query("active"); active == "true" {
			query = query.Where("is_active = ?", true)
		}

		// Toplam sayı
		query.Count(&totalItems)

		// Veriyi çek
		query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&coupons)

		// Pagination meta
		totalPages := int64(0)
		if totalItems > 0 {
			totalPages = (totalItems + int64(limit) - 1) / int64(limit)
		}

		return c.JSON(fiber.Map{
			"coupons": coupons, // Frontend "coupons" bekliyor
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

	// --- 2. TEK KUPON GETİR ---
	app.Get("/coupons/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var coupon Coupon
		if err := DB.First(&coupon, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kupon bulunamadı"})
		}
		return c.JSON(coupon)
	})

	// --- 3. YENİ KUPON OLUŞTUR (Admin) ---
	app.Post("/coupons", func(c *fiber.Ctx) error {
		coupon := new(Coupon)
		if err := c.BodyParser(coupon); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Kupon kodu büyük harfe çevir (tutarlılık için)
		coupon.Code = strings.ToUpper(coupon.Code)

		// Aynı kod var mı kontrol et
		var existing Coupon
		if DB.Where("code = ?", coupon.Code).First(&existing).Error == nil {
			return c.Status(400).JSON(fiber.Map{"error": "Bu kupon kodu zaten mevcut"})
		}

		if err := DB.Create(coupon).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Kupon oluşturulamadı"})
		}

		fmt.Printf("🎫 Yeni kupon oluşturuldu: %s\n", coupon.Code)
		return c.Status(201).JSON(coupon)
	})

	// --- 4. KUPON GÜNCELLE (Admin) ---
	app.Put("/coupons/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var coupon Coupon
		if err := DB.First(&coupon, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kupon bulunamadı"})
		}

		var updateData Coupon
		if err := c.BodyParser(&updateData); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Güncelle (sıfır değerler güncellenmez - GORM davranışı)
		DB.Model(&coupon).Updates(updateData)
		return c.JSON(coupon)
	})

	// --- 5. KUPON SİL (Admin) ---
	app.Delete("/coupons/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var coupon Coupon
		if err := DB.First(&coupon, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kupon bulunamadı"})
		}

		DB.Delete(&coupon)
		fmt.Printf("🗑️ Kupon silindi: %s\n", coupon.Code)
		return c.JSON(fiber.Map{"message": "Kupon silindi"})
	})

	/*

	   NOT: Bu endpoint kuponu KULLANMAZ, sadece kontrol eder
	   Kullanım, sipariş oluşturulunca /coupons/use ile yapılır
	*/
	app.Post("/coupons/apply", func(c *fiber.Ctx) error {
		var req ApplyCouponRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Validasyon
		coupon, message, valid := validateCoupon(req.Code, req.UserID, req.OrderTotal)
		if !valid {
			return c.JSON(ApplyCouponResponse{
				Valid:   false,
				Message: message,
			})
		}

		// İndirim hesapla
		discount := calculateDiscount(coupon, req.OrderTotal)
		newTotal := req.OrderTotal - discount

		fmt.Printf("🎫 Kupon doğrulandı: %s → %.0f TL indirim\n", coupon.Code, discount)

		return c.JSON(ApplyCouponResponse{
			Valid:        true,
			Message:      fmt.Sprintf("🎉 %s kuponu uygulandı!", coupon.Code),
			DiscountType: coupon.DiscountType,
			Discount:     discount,
			NewTotal:     newTotal,
			CouponID:     coupon.ID,
		})
	})

	// --- 7. KUPON KULLANIMINI KAYDET ---
	/*
	   Bu endpoint sipariş oluşturulduktan sonra çağrılır
	   Order Service → Coupon Service

	   İşlem sırası:
	   1. Sipariş oluştur (Order Service)
	   2. Ödeme al (Payment Service)
	   3. Kuponu kullanıldı olarak işaretle (Coupon Service)
	*/
	app.Post("/coupons/use", func(c *fiber.Ctx) error {
		var req struct {
			CouponID uint    `json:"coupon_id"`
			UserID   uint    `json:"user_id"`
			OrderID  uint    `json:"order_id"`
			Discount float64 `json:"discount"`
		}

		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Kuponu bul
		var coupon Coupon
		if err := DB.First(&coupon, req.CouponID).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kupon bulunamadı"})
		}

		// Kullanım kaydı oluştur
		usage := CouponUsage{
			UserID:   req.UserID,
			CouponID: req.CouponID,
			OrderID:  req.OrderID,
			Discount: req.Discount,
		}
		DB.Create(&usage)

		// Kullanım sayısını artır
		DB.Model(&coupon).Update("used_count", coupon.UsedCount+1)

		fmt.Printf("✅ Kupon kullanıldı: %s (User: %d, Order: %d)\n", coupon.Code, req.UserID, req.OrderID)

		return c.JSON(fiber.Map{"message": "Kupon kullanımı kaydedildi"})
	})

	// --- 8. KUPON İSTATİSTİKLERİ (Admin) ---
	app.Get("/coupons/:id/stats", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var coupon Coupon
		if err := DB.First(&coupon, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kupon bulunamadı"})
		}

		// Toplam indirim tutarını hesapla
		var totalDiscount float64
		DB.Model(&CouponUsage{}).Where("coupon_id = ?", id).Select("COALESCE(SUM(discount), 0)").Scan(&totalDiscount)

		// Kullanım yüzdesi
		usagePercent := float64(coupon.UsedCount) / float64(coupon.MaxUses) * 100

		return c.JSON(fiber.Map{
			"code":           coupon.Code,
			"total_uses":     coupon.UsedCount,
			"max_uses":       coupon.MaxUses,
			"usage_percent":  usagePercent,
			"total_discount": totalDiscount,
			"is_active":      coupon.IsActive,
		})
	})

	log.Fatal(app.Listen(":3010"))
}
