package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive" // ObjectId için
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Yorum Modeli
type Review struct {
	ID        primitive.ObjectID `json:"id" bson:"_id,omitempty"` // Mongo'nun kendi özel ID yapısı
	ProductID int                `json:"product_id" bson:"product_id"`
	UserID    int                `json:"user_id" bson:"user_id"`
	UserName  string             `json:"user_name" bson:"user_name"` // Join yapmamak için ismi de kaydediyoruz (NoSQL mantığı)
	Rating    int                `json:"rating" bson:"rating"`       // 1-5 arası yıldız
	Comment   string             `json:"comment" bson:"comment"`
	CreatedAt time.Time          `json:"created_at" bson:"created_at"`
}

var collection *mongo.Collection

func initMongo() {
	// MongoDB Bağlantı Cümlesi (Docker içindeki isme göre)
	// Localhost yerine "mongo" kullanacağız (Docker ağı içinde konuşacakları için)
	// Ama sen şimdilik "go run" ile dışarıdan çalıştıracaksan "localhost" kullanmalısın.
	// Prod ortamında bu ENV variable ile yönetilir.
	clientOptions := options.Client().ApplyURI("mongodb://localhost:27017")

	// Bağlan
	client, err := mongo.Connect(context.TODO(), clientOptions)
	if err != nil {
		log.Fatal(err)
	}

	// Bağlantıyı Test Et (Ping)
	err = client.Ping(context.TODO(), nil)
	if err != nil {
		log.Fatal("MongoDB'ye ulaşılamadı:", err)
	}

	fmt.Println("🚀 MongoDB Bağlantısı Başarılı!")

	// Veritabanı: ecommerce, Koleksiyon: reviews
	collection = client.Database("ecommerce").Collection("reviews")
}

func main() {
	initMongo()
	app := fiber.New()

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "*",
		AllowMethods: "*",
	}))

	// 1. Yorum Ekle (POST)
	app.Post("/reviews", func(c *fiber.Ctx) error {
		review := new(Review)
		if err := c.BodyParser(review); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		// Otomatik alanları doldur
		review.ID = primitive.NewObjectID() // Rastgele eşsiz ID üret
		review.CreatedAt = time.Now()

		// Mongo'ya Kaydet
		_, err := collection.InsertOne(context.TODO(), review)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Yorum kaydedilemedi"})
		}

		return c.Status(201).JSON(review)
	})

	// 2. Bir Ürünün Yorumlarını Getir (GET)
	app.Get("/reviews/:productId", func(c *fiber.Ctx) error {
		productId := c.Params("productId") // String gelir

		// Veritabanında ProductID int olduğu için çevirmemiz lazım ama
		// URL'den gelen parametreyi int'e çevirip filtreleyeceğiz.
		var pID int
		fmt.Sscanf(productId, "%d", &pID)

		// Filtre: WHERE product_id = ?
		filter := bson.M{"product_id": pID}

		// Sorguyu Çalıştır
		cursor, err := collection.Find(context.TODO(), filter)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Yorumlar getirilemedi"})
		}

		// Sonuçları Diziye Aktar
		var reviews []Review
		if err = cursor.All(context.TODO(), &reviews); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Veri işleme hatası"})
		}

		return c.JSON(reviews)
	})

	log.Fatal(app.Listen(":3008"))
}
