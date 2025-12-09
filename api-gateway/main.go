package main

import (
	"log"
	"strconv" // Status code'u stringe çevirmek için

	"github.com/gofiber/adaptor/v2" // Fiber'ı standart Go handler'ına çevirir
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/proxy"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// 1. KENDİ METRİĞİMİZİ TANIMLIYORUZ (Custom Metric)
// Bu, "http_requests_total" adında bir sayaç oluşturur.
var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Toplam HTTP istek sayısı",
		},
		[]string{"method", "path", "status"}, // Bu etiketlere göre kırılım yapabiliriz
	)
)

func main() {
	app := fiber.New()

	// --- 2. MANUEL MIDDLEWARE ---
	// Her istek geldiğinde bu fonksiyon çalışır
	app.Use(func(c *fiber.Ctx) error {
		// İsteği işle (Next)
		err := c.Next()

		// İşlem bitince sayacı arttır
		httpRequestsTotal.WithLabelValues(
			c.Method(),                              // GET, POST...
			c.Path(),                                // /api/products...
			strconv.Itoa(c.Response().StatusCode()), // 200, 404...
		).Inc()

		return err
	})

	// --- 3. METRİK SAYFASI ---
	// Prometheus gelip verileri buradan okuyacak
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	// --- CORS AYARLARI ---
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// --- ROTALAR ---

	// Auth Service (3002)
	app.Group("/api/auth", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/auth"):]
		return proxy.Do(c, "http://localhost:3002"+path)
	})

	// Product Service (3001)
	app.Group("/api/products", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/products"):]
		return proxy.Do(c, "http://localhost:3001/products"+path)
	})

	// Cart Service (3003)
	app.Group("/api/cart", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/cart"):]
		return proxy.Do(c, "http://localhost:3003/cart"+path)
	})

	// Order Service (3004)
	app.Use("/api/orders", func(c *fiber.Ctx) error {
		url := "http://localhost:3004/orders" + c.OriginalURL()[11:] // /api/orders kısmını at
		// Basit string işlemi: "/api/orders" -> 11 karakter
		if len(c.OriginalURL()) > 11 {
			// Daha güvenli url oluşturma
			url = "http://localhost:3004" + c.OriginalURL()[4:]
		} else {
			url = "http://localhost:3004/orders"
		}
		return proxy.Do(c, url)
	})

	// Search Service (3006)
	app.Use("/api/search", func(c *fiber.Ctx) error {
		url := "http://localhost:3006" + c.OriginalURL()[4:]
		return proxy.Do(c, url)
	})

	log.Fatal(app.Listen(":8080"))
}
