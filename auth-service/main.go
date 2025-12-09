package main

import (
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors" // <--- YENİ EKLENDİ
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// Auth Service'de de aynı gizli anahtar olmalı
const SecretKey = "benim_cok_gizli_anahtarim_senior_oluyorum"

type User struct {
	gorm.Model
	Name     string `json:"name"`
	Email    string `json:"email" gorm:"unique"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"is_admin" gorm:"default:false"`
}

func initDatabase() {
	dsn := "host=localhost user=user password=password dbname=ecommerce port=5432 sslmode=disable"
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Auth Service DB Hatası: ", err)
	}

	DB.AutoMigrate(&User{})
	fmt.Println("🚀 Auth Service Veritabanına Bağlandı!")
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func main() {
	initDatabase()
	app := fiber.New()

	// --- CORS AYARI (BURAYA EKLENDİ) ---
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// --- REGISTER ---
	app.Post("/register", func(c *fiber.Ctx) error {
		var data map[string]string
		if err := c.BodyParser(&data); err != nil {
			return err
		}

		// LOG: Kayıt için ne geldi?
		fmt.Println("------------------------------------------------")
		fmt.Printf("📝 KAYIT İSTEĞİ:\nİsim: %s\nEmail: %s\nŞifre (Ham): '%s'\n", data["name"], data["email"], data["password"])

		// Şifre boş mu kontrolü (ÖNEMLİ!)
		if data["password"] == "" {
			fmt.Println("❌ HATA: Şifre boş geldi!")
			return c.Status(400).JSON(fiber.Map{"message": "Şifre boş olamaz!"})
		}

		hashedPassword, _ := hashPassword(data["password"])

		fmt.Printf("🔐 Oluşan Hash: %s\n", hashedPassword)

		user := User{
			Name:     data["name"],
			Email:    data["email"],
			Password: hashedPassword,
		}

		if result := DB.Create(&user); result.Error != nil {
			fmt.Println("❌ DB Yazma Hatası:", result.Error)
			return c.Status(400).JSON(fiber.Map{"message": "Bu email zaten kayıtlı veya hata oluştu!"})
		}

		fmt.Println("✅ Kullanıcı başarıyla oluşturuldu.")
		return c.JSON(user)
	})

	// --- LOGIN ---
	app.Post("/login", func(c *fiber.Ctx) error {
		var data map[string]string
		if err := c.BodyParser(&data); err != nil {
			return err
		}

		// LOG 1: Gelen veriyi görelim
		fmt.Println("------------------------------------------------")
		fmt.Printf("🔍 LOGIN İSTEĞİ GELDİ:\nEmail: '%s'\nŞifre: '%s'\n", data["email"], data["password"])

		var user User
		DB.Where("email = ?", data["email"]).First(&user)

		// LOG 2: Veritabanında bulundu mu?
		if user.ID == 0 {
			fmt.Println("❌ HATA: Kullanıcı veritabanında bulunamadı!")
			return c.Status(400).JSON(fiber.Map{"message": "Kullanıcı bulunamadı!"})
		}
		fmt.Printf("✅ Kullanıcı Bulundu: ID=%d, İsim=%s\n", user.ID, user.Name)
		fmt.Printf("🔐 DB'deki Hash: %s\n", user.Password)

		// Şifre Kontrolü
		err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(data["password"]))

		// LOG 3: Şifre kontrol sonucu
		if err != nil {
			fmt.Println("❌ HATA: Şifre uyuşmuyor! Detay:", err)
			return c.Status(400).JSON(fiber.Map{"message": "Şifre hatalı!"})
		}

		fmt.Println("✅ BAŞARILI: Şifre doğru, token üretiliyor...")

		// Token Oluştur
		claims := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": user.ID,
			"exp": time.Now().Add(time.Hour * 24).Unix(),
		})

		token, err := claims.SignedString([]byte(SecretKey))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"message": "Token oluşturulamadı"})
		}

		// Login cevabını güncelliyoruz: Token + User Bilgisi
		return c.JSON(fiber.Map{
			"message": "Giriş başarılı",
			"token":   token,
			"user": fiber.Map{
				"id":       user.ID,
				"name":     user.Name,
				"email":    user.Email,
				"is_admin": user.IsAdmin,
			},
		})
	})

	log.Fatal(app.Listen(":3002"))
}
