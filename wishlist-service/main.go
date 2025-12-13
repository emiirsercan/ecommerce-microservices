package main

import (
	"context"
	"fmt"
	"log"

	jwtware "github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/redis/go-redis/v9"
)

const SecretKey = "benim_cok_gizli_anahtarim_senior_oluyorum"

var rdb *redis.Client
var ctx = context.Background()

func initRedis() {
	// Docker içinde "redis", localde "localhost"
	rdb = redis.NewClient(&redis.Options{
		Addr:     "localhost:6379", // Test ederken localhost. Docker'da "redis:6379" olmalı (ENV ile yönetilir normalde)
		Password: "",               // Şifre yok
		DB:       0,                // Default DB
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatal("Redis bağlantı hatası:", err)
	}
	fmt.Println("🚀 Redis Bağlantısı Başarılı!")
}

// İstek Modeli
type WishlistReq struct {
	ProductID int `json:"product_id"`
}

func main() {
	initRedis()
	app := fiber.New()

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "*",
		AllowMethods: "*",
	}))
	// 🔥 GÜVENLİK DUVARI (MIDDLEWARE) 🔥
	// Buradan sonraki tüm rotalar Token ister!
	app.Use(jwtware.New(jwtware.Config{
		SigningKey: jwtware.SigningKey{Key: []byte(SecretKey)},
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Giriş yapmalısınız!"})
		},
	}))

	// Anahtar Formatı: "wishlist:{userID}" -> [1, 55, 102]

	// 1. Favoriye Ekle (POST /wishlist/:userid)
	app.Post("/wishlist/:userid", func(c *fiber.Ctx) error {
		userID := c.Params("userid")
		req := new(WishlistReq)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		key := fmt.Sprintf("wishlist:%s", userID)

		// Redis SADD: Set'e ekle (Varsa eklemez, duplicate olmaz)
		err := rdb.SAdd(ctx, key, req.ProductID).Err()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Redis hatası"})
		}

		return c.JSON(fiber.Map{"message": "Favorilere eklendi", "product_id": req.ProductID})
	})

	// 2. Favoriden Çıkar (DELETE /wishlist/:userid)
	app.Delete("/wishlist/:userid", func(c *fiber.Ctx) error {
		userID := c.Params("userid")
		req := new(WishlistReq)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		key := fmt.Sprintf("wishlist:%s", userID)

		// Redis SREM: Set'ten sil
		err := rdb.SRem(ctx, key, req.ProductID).Err()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Redis hatası"})
		}

		return c.JSON(fiber.Map{"message": "Favorilerden çıkarıldı"})
	})

	// 3. Favorileri Getir (GET /wishlist/:userid)
	app.Get("/wishlist/:userid", func(c *fiber.Ctx) error {
		userID := c.Params("userid")
		key := fmt.Sprintf("wishlist:%s", userID)

		// Redis SMEMBERS: Tüm listeyi getir
		products, err := rdb.SMembers(ctx, key).Result()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Redis hatası"})
		}

		// Boşsa null değil boş array dön
		if products == nil {
			return c.JSON([]string{})
		}

		return c.JSON(products)
	})

	// Port 3008 (Search 3006, Review 3007 idi)
	log.Fatal(app.Listen(":3009"))
}
