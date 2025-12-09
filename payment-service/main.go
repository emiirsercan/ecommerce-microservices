package main

import (
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

// Frontend'den (aslında Order Service'den) gelecek veri
type PaymentRequest struct {
	CardNumber string  `json:"card_number"`
	CVV        string  `json:"cvv"`
	Expiry     string  `json:"expiry"`
	Amount     float64 `json:"amount"`
}

func main() {
	app := fiber.New()

	app.Post("/pay", func(c *fiber.Ctx) error {
		var req PaymentRequest
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Veri formatı hatalı"})
		}

		log.Println("💳 Ödeme İsteği Geldi. Kart Sonu:", req.CardNumber[len(req.CardNumber)-1:])

		// --- SANAL BANKA MANTIĞI ---
		// Kart numarasının son hanesini al
		lastChar := req.CardNumber[len(req.CardNumber)-1:]
		lastDigit, _ := strconv.Atoi(lastChar)

		// Çift ise Başarılı, Tek ise Başarısız
		if lastDigit%2 != 0 {
			// Yetersiz Bakiye Simülasyonu
			return c.Status(400).JSON(fiber.Map{"status": "failed", "error": "Yetersiz Bakiye (Tek sayı girdiniz)"})
		}

		// Başarılı
		return c.Status(200).JSON(fiber.Map{"status": "success", "transaction_id": "TXN_123456"})
	})

	// Port 3005'te çalışsın
	log.Fatal(app.Listen(":3005"))
}
