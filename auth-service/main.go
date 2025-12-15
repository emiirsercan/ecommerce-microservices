package main

import (
	"fmt"
	"log"
	"time"

	jwtware "github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

const SecretKey = "benim_cok_gizli_anahtarim_senior_oluyorum"

// --- KULLANICI MODELİ ---
type User struct {
	gorm.Model
	Name     string `json:"name"`
	Email    string `json:"email" gorm:"unique"`
	Password string `json:"-"` // JSON'da şifreyi gizle
	Phone    string `json:"phone"`
	IsAdmin  bool   `json:"is_admin" gorm:"default:false"`
}

// --- ADRES MODELİ ---
type Address struct {
	gorm.Model
	UserID     uint   `json:"user_id"`
	Title      string `json:"title"`       // Ev, İş, Yazlık vs.
	FullName   string `json:"full_name"`   // Alıcı adı
	Phone      string `json:"phone"`       // Alıcı telefonu
	City       string `json:"city"`        // İl
	District   string `json:"district"`    // İlçe
	Address    string `json:"address"`     // Açık adres
	PostalCode string `json:"postal_code"` // Posta kodu
	IsDefault  bool   `json:"is_default" gorm:"default:false"`
}

// --- İSTEK MODELLERİ ---
type UpdateProfileRequest struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func initDatabase() {
	dsn := "host=localhost user=user password=password dbname=ecommerce port=5432 sslmode=disable"
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Auth Service DB Hatası: ", err)
	}

	// Tabloları migrate et
	DB.AutoMigrate(&User{}, &Address{})
	fmt.Println("🚀 Auth Service Veritabanına Bağlandı!")

	// Default admin kullanıcısı oluştur
	seedAdminUser()
}

/*
seedAdminUser: Varsayılan admin kullanıcısı oluşturur

📝 Demo Bilgileri:

	Email: admin@test.com
	Şifre: 123456

⚠️ Production'da bu fonksiyonu kaldırın veya güvenli şifreler kullanın!
*/
func seedAdminUser() {
	var existingAdmin User

	// Admin zaten var mı kontrol et
	if DB.Where("email = ?", "admin@test.com").First(&existingAdmin).Error == nil {
		// Admin zaten var - HER ZAMAN is_admin: true yap (güvenlik için)
		result := DB.Model(&existingAdmin).Update("is_admin", true)
		if result.Error != nil {
			fmt.Println("⚠️ Admin güncelleme hatası:", result.Error)
		} else {
			fmt.Printf("✅ Admin kullanıcı güncellendi: admin@test.com (is_admin: true)\n")
		}
		return
	}

	// Yeni admin oluştur
	hashedPassword, _ := hashPassword("123456")
	admin := User{
		Name:     "Admin",
		Email:    "admin@test.com",
		Password: hashedPassword,
		IsAdmin:  true,
	}

	if err := DB.Create(&admin).Error; err != nil {
		fmt.Println("⚠️ Admin kullanıcı oluşturulamadı:", err)
		return
	}

	fmt.Println("🛡️ Default admin kullanıcı oluşturuldu: admin@test.com / 123456")
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func main() {
	initDatabase()
	app := fiber.New()

	// --- CORS AYARI ---
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// =====================
	// PUBLIC ENDPOINT'LER (Token gerektirmez)
	// =====================

	// --- REGISTER ---
	app.Post("/register", func(c *fiber.Ctx) error {
		var data map[string]string
		if err := c.BodyParser(&data); err != nil {
			return err
		}

		fmt.Println("------------------------------------------------")
		fmt.Printf("📝 KAYIT İSTEĞİ:\nİsim: %s\nEmail: %s\n", data["name"], data["email"])

		if data["password"] == "" {
			return c.Status(400).JSON(fiber.Map{"message": "Şifre boş olamaz!"})
		}

		hashedPassword, _ := hashPassword(data["password"])

		user := User{
			Name:     data["name"],
			Email:    data["email"],
			Password: hashedPassword,
			Phone:    data["phone"],
		}

		if result := DB.Create(&user); result.Error != nil {
			return c.Status(400).JSON(fiber.Map{"message": "Bu email zaten kayıtlı veya hata oluştu!"})
		}

		fmt.Println("✅ Kullanıcı başarıyla oluşturuldu.")
		return c.JSON(fiber.Map{
			"message": "Kayıt başarılı",
			"user": fiber.Map{
				"id":    user.ID,
				"name":  user.Name,
				"email": user.Email,
			},
		})
	})

	// --- ADMIN DURUMLARINI DÜZELT (Geliştirme için) ---
	/*
	   Bu endpoint tüm kullanıcıların is_admin durumunu düzeltir:
	   - admin@test.com → is_admin: true
	   - Diğer herkes → is_admin: false

	   ⚠️ Production'da bu endpoint kaldırılmalı!
	*/
	app.Post("/fix-admins", func(c *fiber.Ctx) error {
		// 1. Tüm kullanıcıları is_admin: false yap
		result := DB.Model(&User{}).Where("email != ?", "admin@test.com").Update("is_admin", false)
		fmt.Printf("🔧 %d kullanıcı is_admin: false yapıldı\n", result.RowsAffected)

		// 2. Sadece admin@test.com'u is_admin: true yap
		DB.Model(&User{}).Where("email = ?", "admin@test.com").Update("is_admin", true)
		fmt.Println("✅ admin@test.com is_admin: true yapıldı")

		return c.JSON(fiber.Map{
			"message":     "Admin durumları düzeltildi",
			"users_fixed": result.RowsAffected,
			"admin_email": "admin@test.com",
		})
	})

	// --- LOGIN ---
	app.Post("/login", func(c *fiber.Ctx) error {
		var data map[string]string
		if err := c.BodyParser(&data); err != nil {
			return err
		}

		fmt.Println("------------------------------------------------")
		fmt.Printf("🔍 LOGIN İSTEĞİ: %s\n", data["email"])

		var user User
		DB.Where("email = ?", data["email"]).First(&user)

		if user.ID == 0 {
			return c.Status(400).JSON(fiber.Map{"message": "Kullanıcı bulunamadı!"})
		}

		err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(data["password"]))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"message": "Şifre hatalı!"})
		}

		fmt.Printf("✅ Giriş başarılı: %s (is_admin: %v)\n", user.Name, user.IsAdmin)

		// Token Oluştur
		claims := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": user.ID,
			"exp": time.Now().Add(time.Hour * 24).Unix(),
		})

		token, err := claims.SignedString([]byte(SecretKey))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"message": "Token oluşturulamadı"})
		}

		return c.JSON(fiber.Map{
			"message": "Giriş başarılı",
			"token":   token,
			"user": fiber.Map{
				"id":       user.ID,
				"name":     user.Name,
				"email":    user.Email,
				"phone":    user.Phone,
				"is_admin": user.IsAdmin,
			},
		})
	})

	// =====================
	// PROTECTED ENDPOINT'LER (Token gerektirir)
	// =====================

	// JWT Middleware
	app.Use(jwtware.New(jwtware.Config{
		SigningKey: jwtware.SigningKey{Key: []byte(SecretKey)},
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Giriş yapmanız gerekiyor!"})
		},
	}))

	// --- PROFİL BİLGİLERİNİ GETİR ---
	app.Get("/profile/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var user User
		if err := DB.First(&user, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kullanıcı bulunamadı"})
		}

		return c.JSON(fiber.Map{
			"id":         user.ID,
			"name":       user.Name,
			"email":      user.Email,
			"phone":      user.Phone,
			"is_admin":   user.IsAdmin,
			"created_at": user.CreatedAt,
		})
	})

	// --- PROFİL GÜNCELLE ---
	app.Put("/profile/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var user User
		if err := DB.First(&user, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kullanıcı bulunamadı"})
		}

		var req UpdateProfileRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Güncelle
		user.Name = req.Name
		user.Phone = req.Phone
		DB.Save(&user)

		fmt.Printf("✏️ Profil güncellendi: %s\n", user.Name)

		return c.JSON(fiber.Map{
			"message": "Profil güncellendi",
			"user": fiber.Map{
				"id":    user.ID,
				"name":  user.Name,
				"email": user.Email,
				"phone": user.Phone,
			},
		})
	})

	// --- ŞİFRE DEĞİŞTİR ---
	app.Post("/profile/:id/password", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var user User
		if err := DB.First(&user, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Kullanıcı bulunamadı"})
		}

		var req ChangePasswordRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Mevcut şifreyi doğrula
		err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Mevcut şifre hatalı!"})
		}

		// Yeni şifreyi hashle
		hashedPassword, _ := hashPassword(req.NewPassword)
		user.Password = hashedPassword
		DB.Save(&user)

		fmt.Printf("🔐 Şifre değiştirildi: %s\n", user.Email)

		return c.JSON(fiber.Map{"message": "Şifre başarıyla değiştirildi"})
	})

	// =====================
	// ADRES ENDPOINT'LERİ
	// =====================

	// --- ADRESLERİ LİSTELE ---
	app.Get("/addresses/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		var addresses []Address
		DB.Where("user_id = ?", userid).Order("is_default DESC, created_at DESC").Find(&addresses)

		// Boş array dön (null değil)
		if addresses == nil {
			return c.JSON([]Address{})
		}

		return c.JSON(addresses)
	})

	// --- ADRES EKLE ---
	app.Post("/addresses/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")

		var address Address
		if err := c.BodyParser(&address); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// UserID'yi ata
		var uid uint
		fmt.Sscanf(userid, "%d", &uid)
		address.UserID = uid

		// Eğer ilk adres ise varsayılan yap
		var count int64
		DB.Model(&Address{}).Where("user_id = ?", userid).Count(&count)
		if count == 0 {
			address.IsDefault = true
		}

		if result := DB.Create(&address); result.Error != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Adres kaydedilemedi"})
		}

		fmt.Printf("📍 Yeni adres eklendi: %s (%s)\n", address.Title, address.City)

		return c.Status(201).JSON(address)
	})

	// --- ADRES GÜNCELLE ---
	app.Put("/addresses/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var address Address
		if err := DB.First(&address, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Adres bulunamadı"})
		}

		var updateData Address
		if err := c.BodyParser(&updateData); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Geçersiz veri"})
		}

		// Güncelle
		address.Title = updateData.Title
		address.FullName = updateData.FullName
		address.Phone = updateData.Phone
		address.City = updateData.City
		address.District = updateData.District
		address.Address = updateData.Address
		address.PostalCode = updateData.PostalCode
		DB.Save(&address)

		fmt.Printf("✏️ Adres güncellendi: %s\n", address.Title)

		return c.JSON(address)
	})

	// --- ADRES SİL ---
	app.Delete("/addresses/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var address Address
		if err := DB.First(&address, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Adres bulunamadı"})
		}

		DB.Delete(&address)
		fmt.Printf("🗑️ Adres silindi: %s\n", address.Title)

		return c.JSON(fiber.Map{"message": "Adres silindi"})
	})

	// --- VARSAYILAN ADRES YAP ---
	app.Put("/addresses/:id/default", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var address Address
		if err := DB.First(&address, id).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Adres bulunamadı"})
		}

		// Önce tüm adreslerin varsayılanını kaldır
		DB.Model(&Address{}).Where("user_id = ?", address.UserID).Update("is_default", false)

		// Bu adresi varsayılan yap
		address.IsDefault = true
		DB.Save(&address)

		fmt.Printf("⭐ Varsayılan adres: %s\n", address.Title)

		return c.JSON(fiber.Map{"message": "Varsayılan adres güncellendi"})
	})

	log.Fatal(app.Listen(":3002"))
}
