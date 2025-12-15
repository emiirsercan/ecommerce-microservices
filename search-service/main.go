package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/olivere/elastic/v7"
	"github.com/streadway/amqp"
)

type ProductIndex struct {
	ID         int    `json:"ID"`
	Name       string `json:"name"`
	Price      int    `json:"price"`
	Code       string `json:"code"`
	Stock      int    `json:"stock"`
	CategoryID int    `json:"category_id"`
}

var client *elastic.Client
var ctx = context.Background()

func initElastic() {
	var err error

	// Elasticsearch bağlantısını bekle (Docker başlaması zaman alabilir)
	for i := 0; i < 10; i++ {
		client, err = elastic.NewClient(
			elastic.SetURL("http://localhost:9200"),
			elastic.SetSniff(false),
			elastic.SetHealthcheck(false),
		)
		if err == nil {
			break
		}
		fmt.Printf("⏳ Elasticsearch'e bağlanılamadı, tekrar deneniyor... (%d/10)\n", i+1)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatal("❌ Elasticsearch bağlantısı başarısız:", err)
	}

	fmt.Println("🚀 Elasticsearch Bağlantısı Başarılı!")

	// Index'i oluştur (yoksa)
	ensureIndex()
}

// Index'in var olduğundan emin ol
func ensureIndex() {
	exists, err := client.IndexExists("products").Do(ctx)
	if err != nil {
		fmt.Println("⚠️ Index kontrol hatası:", err)
		return
	}

	if !exists {
		// Index oluştur
		mapping := `{
			"settings": {
				"number_of_shards": 1,
				"number_of_replicas": 0
			},
			"mappings": {
				"properties": {
					"ID": { "type": "integer" },
					"name": { 
						"type": "text",
						"analyzer": "standard",
						"fields": {
							"suggest": {
								"type": "completion"
							}
						}
					},
					"price": { "type": "integer" },
					"code": { "type": "keyword" },
					"stock": { "type": "integer" },
					"category_id": { "type": "integer" }
				}
			}
		}`

		_, err := client.CreateIndex("products").BodyString(mapping).Do(ctx)
		if err != nil {
			fmt.Println("⚠️ Index oluşturma hatası:", err)
		} else {
			fmt.Println("📦 'products' index'i oluşturuldu!")
		}
	}
}

// --- BAŞLANGIÇ SENKRONİZASYONU ---
// Product Service'den tüm ürünleri çekip Elasticsearch'e yazar
func syncProductsFromDB() {
	fmt.Println("🔄 Başlangıç senkronizasyonu başlatılıyor...")

	// Product Service'den ürünleri çek (limit=1000 ile tüm ürünleri al)
	resp, err := http.Get("http://localhost:3001/products?limit=1000")
	if err != nil {
		fmt.Println("⚠️ Product Service'e ulaşılamadı:", err)
		fmt.Println("   (Product Service çalışıyor mu?)")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// Product Service artık pagination formatında dönüyor:
	// { "products": [...], "pagination": {...} }
	var response struct {
		Products []ProductIndex `json:"products"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		fmt.Println("⚠️ Ürün verisi parse edilemedi:", err)
		return
	}

	products := response.Products

	if len(products) == 0 {
		fmt.Println("ℹ️ Senkronize edilecek ürün yok.")
		return
	}

	// Elasticsearch'e toplu yazım (Bulk)
	bulkRequest := client.Bulk()
	for _, p := range products {
		req := elastic.NewBulkIndexRequest().
			Index("products").
			Id(strconv.Itoa(p.ID)).
			Doc(p)
		bulkRequest = bulkRequest.Add(req)
	}

	res, err := bulkRequest.Do(ctx)
	if err != nil {
		fmt.Println("❌ Bulk index hatası:", err)
		return
	}

	fmt.Printf("✅ Senkronizasyon tamamlandı! %d ürün indekslendi.\n", len(res.Indexed()))
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	initElastic()

	// Başlangıç senkronizasyonunu arka planda çalıştır
	go func() {
		time.Sleep(2 * time.Second) // Diğer servislerin başlamasını bekle
		syncProductsFromDB()
	}()

	// --- RABBITMQ BAĞLANTISI ---
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

			fmt.Printf("📥 Yeni Ürün: %s → Elasticsearch'e yazılıyor...\n", p.Name)

			_, err := client.Index().
				Index("products").
				Id(strconv.Itoa(p.ID)).
				BodyJson(p).
				Do(ctx)

			if err != nil {
				fmt.Println("❌ Elastic Kayıt Hatası:", err)
			} else {
				fmt.Println("✅ Ürün İndekslendi!")
			}
		}
	}()

	// --- WEB SUNUCUSU ---
	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "*",
	}))

	// --- ANA ARAMA - PAGİNATİON DESTEKLİ ---
	/*
	   📝 KULLANIM:
	   GET /search?q=iphone&page=1&limit=20

	   💡 Elasticsearch'te pagination:
	   - From: Kaç kayıt atlanacak (offset)
	   - Size: Kaç kayıt alınacak (limit)

	   Elasticsearch max 10.000 sonuç döner (deep pagination limiti)
	   Daha fazlası için "search_after" kullanılmalı
	*/
	app.Get("/search", func(c *fiber.Ctx) error {
		query := c.Query("q")
		if query == "" {
			return c.JSON(fiber.Map{
				"products": []interface{}{}, // Frontend "products" bekliyor
				"pagination": fiber.Map{
					"current_page": 1,
					"per_page":     20,
					"total_items":  0,
					"total_pages":  0,
					"has_next":     false,
					"has_prev":     false,
				},
			})
		}

		// Pagination parametreleri
		page := c.QueryInt("page", 1)
		limit := c.QueryInt("limit", 20)

		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}

		from := (page - 1) * limit

		// Fuzzy arama (yazım hatalarını tolere eder)
		searchSource := elastic.NewMultiMatchQuery(query, "name", "code").
			Fuzziness("AUTO").
			MinimumShouldMatch("70%")

		searchResult, err := client.Search().
			Index("products").
			Query(searchSource).
			From(from).           // Offset
			Size(limit).          // Limit
			TrackTotalHits(true). // Toplam sayıyı al (pagination için)
			Do(ctx)

		if err != nil {
			if elastic.IsNotFound(err) {
				return c.JSON(fiber.Map{
					"products": []interface{}{}, // Frontend "products" bekliyor
					"pagination": fiber.Map{
						"current_page": 1,
						"per_page":     limit,
						"total_items":  0,
						"total_pages":  0,
						"has_next":     false,
						"has_prev":     false,
					},
				})
			}
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		var products []ProductIndex
		for _, hit := range searchResult.Hits.Hits {
			var p ProductIndex
			json.Unmarshal(hit.Source, &p)
			products = append(products, p)
		}

		if products == nil {
			products = []ProductIndex{}
		}

		// Pagination meta hesapla
		totalItems := searchResult.TotalHits()
		totalPages := int64(0)
		if totalItems > 0 {
			totalPages = (totalItems + int64(limit) - 1) / int64(limit)
		}

		return c.JSON(fiber.Map{
			"products": products, // Frontend "products" bekliyor
			"query":    query,
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

	// --- ARAMA ÖNERİLERİ (Autocomplete) ---
	app.Get("/search/suggest", func(c *fiber.Ctx) error {
		query := c.Query("q")
		if query == "" || len(query) < 2 {
			return c.JSON([]string{})
		}

		// MatchPhrasePrefixQuery: Case-insensitive, analyzer kullanır
		// "mac" → "MacBook", "iph" → "iPhone" gibi eşleşmeler yapabilir
		prefixQuery := elastic.NewMatchPhrasePrefixQuery("name", query)

		searchResult, err := client.Search().
			Index("products").
			Query(prefixQuery).
			Size(5). // Max 5 öneri
			FetchSourceContext(elastic.NewFetchSourceContext(true).Include("name")).
			Do(ctx)

		if err != nil {
			return c.JSON([]string{})
		}

		var suggestions []string
		seen := make(map[string]bool)

		for _, hit := range searchResult.Hits.Hits {
			var p ProductIndex
			json.Unmarshal(hit.Source, &p)

			// Tekrarları engelle
			if !seen[p.Name] {
				suggestions = append(suggestions, p.Name)
				seen[p.Name] = true
			}
		}

		return c.JSON(suggestions)
	})

	// --- MANUEL SENKRONİZASYON ---
	app.Post("/search/sync", func(c *fiber.Ctx) error {
		go syncProductsFromDB()
		return c.JSON(fiber.Map{"message": "Senkronizasyon başlatıldı"})
	})

	// --- MANUEL İNDEKSLEME ---
	app.Post("/search/manual", func(c *fiber.Ctx) error {
		p := new(ProductIndex)
		if err := c.BodyParser(p); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri hatası"})
		}

		_, err := client.Index().
			Index("products").
			Id(strconv.Itoa(p.ID)).
			BodyJson(p).
			Do(ctx)

		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		return c.Status(201).JSON(fiber.Map{"message": "İndekslendi", "product": p})
	})

	// --- İNDEX İSTATİSTİKLERİ ---
	app.Get("/search/stats", func(c *fiber.Ctx) error {
		count, err := client.Count("products").Do(ctx)
		if err != nil {
			return c.JSON(fiber.Map{"indexed_products": 0})
		}
		return c.JSON(fiber.Map{"indexed_products": count})
	})

	log.Fatal(app.Listen(":3006"))
}
