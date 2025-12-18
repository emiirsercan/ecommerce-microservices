package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/streadway/amqp"
)

// Gelen JSON verisini karşılayacak basit struct
type OrderEvent struct {
	ProductIDs []int `json:"product_ids"`
	UserID     int   `json:"user_id"`
	TotalPrice int   `json:"total_price"`
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}

func main() {
	// 1. RabbitMQ'ya Bağlan (RETRY İLE)
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

	ch, err := conn.Channel()
	failOnError(err, "Kanal açılamadı")
	defer ch.Close()

	// 2. Kuyruğu Tanımla (Order Service ile AYNI İSİM olmak zorunda!)
	q, err := ch.QueueDeclare(
		"order_created", // Kuyruk adı
		false,           // Durable
		false,           // Delete when unused
		false,           // Exclusive
		false,           // No-wait
		nil,             // Arguments
	)
	failOnError(err, "Kuyruk bulunamadı veya oluşturulamadı")

	// 3. Mesajları Tüketmeye Başla (Consume)
	msgs, err := ch.Consume(
		q.Name, // Hangi kuyruk?
		"",     // Consumer ismi (boş bırakırsan o üretir)
		true,   // Auto-Ack (Otomatik "Tamam aldım" onayı. Senior projelerde bu false yapılır, iş bitince manuel onaylanır)
		false,  // Exclusive
		false,  // No-local
		false,  // No-wait
		nil,    // Args
	)
	failOnError(err, "Consumer başlatılamadı")

	// 4. Sonsuz Döngüde Mesajları Okuma
	// Go'da channel (kanal) ile bu iş çok temiz yapılır.
	forever := make(chan bool)

	go func() {
		for d := range msgs {
			// d.Body içinde gelen o JSON (byte olarak) var.
			var order OrderEvent
			json.Unmarshal(d.Body, &order)

			// --- BURADA "EMAİL ATMA" SİMÜLASYONU YAPIYORUZ ---
			fmt.Println("------------------------------------------------")
			fmt.Printf("📨 YENİ SİPARİŞ YAKALANDI!\n")
			fmt.Printf("👤 Kullanıcı ID: %d\n", order.UserID)
			fmt.Printf("📦 Ürünler: %v\n", order.ProductIDs)
			fmt.Printf("💰 Tutar: %d TL\n", order.TotalPrice)
			fmt.Println("✅ E-posta gönderiliyor... GÖNDERİLDİ!")
			fmt.Println("------------------------------------------------")
		}
	}()

	fmt.Println(" [*] Notification Service çalışıyor. Mesaj bekleniyor. Çıkmak için CTRL+C")
	<-forever // Programın kapanmasını engeller
}
