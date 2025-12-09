package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv" // String çevirmek için lazım

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/redis/go-redis/v9"
)

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

	// --- 3. Sepetten Ürün Sil (YENİ ÖZELLİK) ---
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
