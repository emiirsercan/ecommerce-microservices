package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/olivere/elastic/v7"
	"github.com/streadway/amqp" // YENİ
)

type ProductIndex struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Price int    `json:"price"`
	Code  string `json:"code"`
}

var client *elastic.Client
var ctx = context.Background()

func initElastic() {
	var err error
	client, err = elastic.NewClient(
		elastic.SetURL("http://localhost:9200"),
		elastic.SetSniff(false),
	)
	if err != nil {
		log.Fatal("Elasticsearch hatası:", err)
	}
	fmt.Println("🚀 Elasticsearch Bağlantısı Başarılı!")
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	initElastic()

	// --- RABBITMQ BAĞLANTISI (DİNLEYİCİ) ---
	conn, err := amqp.Dial("amqp://guest:guest@localhost:5672/")
	failOnError(err, "RabbitMQ'ya bağlanılamadı")
	defer conn.Close()

	ch, err := conn.Channel()
	failOnError(err, "Kanal açılamadı")
	defer ch.Close()

	q, err := ch.QueueDeclare("product_created", false, false, false, false, nil)
	failOnError(err, "Kuyruk hatası")

	// Mesajları dinle
	msgs, err := ch.Consume(q.Name, "", true, false, false, false, nil)
	failOnError(err, "Consumer hatası")

	// --- ARKA PLAN İŞÇİSİ (Background Worker) ---
	// Web sunucusunu bloklamasın diye ayrı bir thread (goroutine) açıyoruz
	go func() {
		fmt.Println("🎧 Search Service: Yeni ürünleri dinlemeye başladı...")
		for d := range msgs {
			// 1. Gelen mesajı JSON'dan Struct'a çevir
			var p ProductIndex
			json.Unmarshal(d.Body, &p)

			fmt.Printf("📥 Yeni Ürün Yakalandı: %s. Elasticsearch'e yazılıyor...\n", p.Name)

			// 2. Elasticsearch'e kaydet
			_, err := client.Index().
				Index("products").
				Id(strconv.Itoa(p.ID)).
				BodyJson(p).
				Do(ctx)

			if err != nil {
				fmt.Println("❌ Elastic Kayıt Hatası:", err)
			} else {
				fmt.Println("✅ Ürün Başarıyla İndekslendi!")
			}
		}
	}()

	// --- WEB SUNUCUSU (Arama İstekleri İçin) ---
	app := fiber.New()
	app.Use(cors.New(cors.Config{AllowOrigins: "*"}))

	app.Get("/search", func(c *fiber.Ctx) error {
		query := c.Query("q")
		if query == "" {
			return c.JSON([]interface{}{})
		}

		searchSource := elastic.NewMultiMatchQuery(query, "name", "code").Fuzziness("AUTO")
		searchResult, err := client.Search().Index("products").Query(searchSource).Do(ctx)

		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		var products []ProductIndex
		for _, hit := range searchResult.Hits.Hits {
			var p ProductIndex
			json.Unmarshal(hit.Source, &p)
			products = append(products, p)
		}
		return c.JSON(products)
	})

	log.Fatal(app.Listen(":3006"))
}
