package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv" // String çevirmek için lazım

	jwtware "github.com/gofiber/contrib/jwt"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/redis/go-redis/v9"
)

// JWT Secret Key - Auth Service ile AYNI olmalı!
const SecretKey = "benim_cok_gizli_anahtarim_senior_oluyorum"

var ctx = context.Background()
var rdb *redis.Client

type CartItem struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

// Redis Bağlantısı
func initRedis() {
	rdb = redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	if _, err := rdb.Ping(ctx).Result(); err != nil {
		log.Fatal("Redis'e bağlanılamadı:", err)
	}
	fmt.Println("🚀 Cart Service (Redis) Hazır!")
}

func main() {
	initRedis()
	app := fiber.New()

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// ==========================================================================
	// JWT MIDDLEWARE - Tüm endpoint'ler için token gerekli!
	// ==========================================================================
	/*
	   🔒 GÜVENLİK:
	   - Giriş yapmamış kullanıcılar sepete erişemez
	   - Token olmadan 401 Unauthorized döner
	   - Frontend'de login kontrolü yapılsa bile, backend'de de kontrol ŞART!

	   💡 Neden Backend'de Kontrol?
	   Frontend güvenliği kolayca bypass edilebilir (DevTools, Postman, curl).
	   Backend HER ZAMAN son güvenlik katmanıdır.
	*/
	app.Use(jwtware.New(jwtware.Config{
		SigningKey: jwtware.SigningKey{Key: []byte(SecretKey)},
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			fmt.Println("❌ Yetkisiz sepet erişimi denemesi!")
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Sepete erişmek için giriş yapmalısınız!",
			})
		},
	}))

	// --- 1. Sepete Ekle / Güncelle / Adet Değiştir ---
	app.Post("/cart/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		key := "cart_" + userid

		newItem := new(CartItem)
		if err := c.BodyParser(newItem); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Hatalı veri"})
		}

		// Eski sepeti çek
		val, err := rdb.Get(ctx, key).Result()
		var items []CartItem

		if err == redis.Nil {
			items = []CartItem{}
		} else if err == nil {
			json.Unmarshal([]byte(val), &items)
		} else {
			return c.Status(500).JSON(fiber.Map{"error": "Redis hatası"})
		}

		// --- MERGE VE GÜNCELLEME MANTIĞI ---
		found := false
		var updatedItems []CartItem // Yeni temiz liste

		for _, item := range items {
			if item.ProductID == newItem.ProductID {
				// Ürün bulundu, adeti güncelle (Eksi gelirse düşer, artı gelirse artar)
				newQuantity := item.Quantity + newItem.Quantity

				// Eğer yeni adet 0'dan büyükse listeye ekle.
				// 0 veya altındaysa ekleme (Böylece silinmiş olur!)
				if newQuantity > 0 {
					item.Quantity = newQuantity
					updatedItems = append(updatedItems, item)
				}
				found = true
			} else {
				// Diğer ürünleri aynen koru
				updatedItems = append(updatedItems, item)
			}
		}

		// Eğer ürün listede hiç yoksa ve eklenmek istenen miktar pozitifse ekle
		if !found && newItem.Quantity > 0 {
			updatedItems = append(updatedItems, *newItem)
		}

		// Redis'e yeni temiz listeyi kaydet
		data, _ := json.Marshal(updatedItems)
		rdb.Set(ctx, key, data, 24*3600*1000000000)

		return c.JSON(fiber.Map{"message": "Sepet güncellendi", "items": updatedItems})
	})
	// --- SEPET SAYACI (GÜNCELLENMİŞ & LOGLU) ---
	app.Get("/cart/:userid/count", func(c *fiber.Ctx) error {
		userID := c.Params("userid")
		key := fmt.Sprintf("cart_%s", userID)

		// 1. Redis'ten çek (String olarak - diğer endpoint'lerle tutarlı)
		val, err := rdb.Get(ctx, key).Result()
		if err == redis.Nil {
			// Sepet boş
			return c.JSON(fiber.Map{"count": 0})
		}
		if err != nil {
			fmt.Println("❌ Redis Hatası:", err)
			return c.Status(500).JSON(fiber.Map{"count": 0})
		}

		// 2. JSON array olarak parse et
		var items []CartItem
		if err := json.Unmarshal([]byte(val), &items); err != nil {
			fmt.Println("❌ JSON Parse Hatası:", err)
			return c.Status(500).JSON(fiber.Map{"count": 0})
		}

		fmt.Printf("🔍 DEBUG (%s): Redis'te %d ürün bulundu.\n", userID, len(items))

		// 3. Toplam adedi hesapla
		totalCount := 0
		for _, item := range items {
			totalCount += item.Quantity
		}

		fmt.Printf("✅ Toplam Hesaplanan: %d\n", totalCount)
		return c.JSON(fiber.Map{"count": totalCount})
	})

	// --- 2. Sepeti Getir ---
	app.Get("/cart/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		key := "cart_" + userid

		val, err := rdb.Get(ctx, key).Result()
		if err == redis.Nil {
			return c.JSON([]CartItem{})
		}

		var items []CartItem
		json.Unmarshal([]byte(val), &items)
		return c.JSON(items)
	})

	// --- 3. SEPETİ TAMAMEN TEMİZLE (YENİ!) ---
	// DELETE /cart/:userid
	/*
	   💡 Bu endpoint ne zaman kullanılır?
	      - Sipariş tamamlandıktan sonra
	      - Kullanıcı "Sepeti Temizle" butonuna bastığında

	   Redis DEL komutu: Key'i tamamen siler
	*/
	app.Delete("/cart/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		key := "cart_" + userid

		// Redis'ten sil
		err := rdb.Del(ctx, key).Err()
		if err != nil {
			fmt.Println("❌ Sepet temizleme hatası:", err)
			return c.Status(500).JSON(fiber.Map{"error": "Sepet temizlenemedi"})
		}

		fmt.Printf("🗑️ Sepet temizlendi: user_%s\n", userid)
		return c.JSON(fiber.Map{"message": "Sepet temizlendi"})
	})

	// --- 4. Sepetten Tek Ürün Sil ---
	// DELETE /cart/:userid/:productid
	app.Delete("/cart/:userid/:productid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		productidStr := c.Params("productid")
		productid, _ := strconv.Atoi(productidStr) // String'i sayıya çevir

		key := "cart_" + userid

		// Sepeti Çek
		val, err := rdb.Get(ctx, key).Result()
		if err == redis.Nil {
			return c.JSON([]CartItem{})
		}

		var items []CartItem
		json.Unmarshal([]byte(val), &items)

		// FİLTRELEME ALGORİTMASI (Silme Mantığı)
		// Silinecek ürün HARİÇ diğerlerini yeni bir listeye koy
		var newItems []CartItem
		for _, item := range items {
			if item.ProductID != productid {
				newItems = append(newItems, item)
			}
		}

		// Yeni listeyi kaydet
		data, _ := json.Marshal(newItems)
		rdb.Set(ctx, key, data, 24*3600*1000000000)

		return c.JSON(fiber.Map{"message": "Ürün silindi", "items": newItems})
	})

	log.Fatal(app.Listen(":3003"))
}
