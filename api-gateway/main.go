package main

import (
	"log"
	"os"
	"strconv" // Status code'u stringe çevirmek için
	"time"

	"github.com/gofiber/adaptor/v2" // Fiber'ı standart Go handler'ına çevirir
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/proxy"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// 1. KENDİ METRİĞİMİZİ TANIMLIYORUZ (Custom Metric)
// Bu, "http_requests_total" adında bir sayaçi oluşturur.
var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Toplam HTTP istek sayısı",
		},
		[]string{"method", "path", "status"}, // Bu etiketlere göre kırılım yapabiliriz
	)
)

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func main() {
	app := fiber.New()

	// Service URLs
	authServiceURL := getEnv("AUTH_SERVICE_URL", "http://localhost:3002")
	productServiceURL := getEnv("PRODUCT_SERVICE_URL", "http://localhost:3001")
	cartServiceURL := getEnv("CART_SERVICE_URL", "http://localhost:3003")
	orderServiceURL := getEnv("ORDER_SERVICE_URL", "http://localhost:3004")
	searchServiceURL := getEnv("SEARCH_SERVICE_URL", "http://localhost:3006")
	reviewServiceURL := getEnv("REVIEW_SERVICE_URL", "http://localhost:3008")
	wishlistServiceURL := getEnv("WISHLIST_SERVICE_URL", "http://localhost:3009")
	couponServiceURL := getEnv("COUPON_SERVICE_URL", "http://localhost:3010")

	// --- CORS AYARLARI (EN BAŞTA OLMALI!) ---
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// --- MANUEL MIDDLEWARE (Prometheus Metrics) ---
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

	// --- METRİK SAYFASI ---
	// Prometheus gelip verileri buradan okuyacak
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	// ==============================================================================
	// HEALTH CHECK ENDPOINT
	// ==============================================================================
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":    "healthy",
			"service":   "api-gateway",
			"timestamp": time.Now().Format(time.RFC3339),
			"checks": fiber.Map{
				"self": fiber.Map{"status": "healthy", "message": "gateway is running"},
			},
		})
	})

	// --- ROTALAR ---

	// Auth Service (3002) - Login/Register
	app.Group("/api/auth", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/auth"):]
		return proxy.Do(c, authServiceURL+path)
	})

	// Profile Service (3002 - Auth Service içinde)
	app.All("/api/profile/:id/password", func(c *fiber.Ctx) error {
		// /api/profile/5/password -> http://localhost:3002/profile/5/password
		id := c.Params("id")
		return proxy.Do(c, authServiceURL+"/profile/"+id+"/password")
	})

	app.All("/api/profile/:id", func(c *fiber.Ctx) error {
		// /api/profile/5 -> http://localhost:3002/profile/5
		id := c.Params("id")
		return proxy.Do(c, authServiceURL+"/profile/"+id)
	})

	// Address Service (3002 - Auth Service içinde)
	app.All("/api/addresses/:id/default", func(c *fiber.Ctx) error {
		id := c.Params("id")
		return proxy.Do(c, authServiceURL+"/addresses/"+id+"/default")
	})

	app.All("/api/addresses/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		return proxy.Do(c, authServiceURL+"/addresses/"+id)
	})

	// Product Service (3001) - Ürünler
	app.Group("/api/products", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/products"):]
		// Query string'i de ekle (filtreleme için)
		queryString := string(c.Request().URI().QueryString())
		url := productServiceURL + "/products" + path
		if queryString != "" {
			url += "?" + queryString
		}
		return proxy.Do(c, url)
	})

	// Category Service (3001 - Product Service içinde)
	app.Group("/api/categories", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/categories"):]
		return proxy.Do(c, productServiceURL+"/categories"+path)
	})

	// Cart Service (3003)
	app.Group("/api/cart", func(c *fiber.Ctx) error {
		path := c.Path()[len("/api/cart"):]
		return proxy.Do(c, cartServiceURL+"/cart"+path)
	})

	// ===========================================
	// Order Service (3004) - Sipariş Yönetimi
	// ===========================================

	// 1. İstatistikler (Admin) - En spesifik, ilk sıraya
	app.Get("/api/orders/stats", func(c *fiber.Ctx) error {
		return proxy.Do(c, orderServiceURL+"/orders/stats")
	})

	// 2. Kullanıcının siparişleri - /api/orders/user/:userid
	app.Get("/api/orders/user/:userid", func(c *fiber.Ctx) error {
		userid := c.Params("userid")
		return proxy.Do(c, orderServiceURL+"/orders/user/"+userid)
	})

	// 3. Sipariş durumu güncelle - /api/orders/:id/status
	app.Patch("/api/orders/:id/status", func(c *fiber.Ctx) error {
		id := c.Params("id")
		return proxy.Do(c, orderServiceURL+"/orders/"+id+"/status")
	})

	// 4. Tek sipariş detayı - /api/orders/:id
	app.Get("/api/orders/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		return proxy.Do(c, orderServiceURL+"/orders/"+id)
	})

	// 5. Tüm siparişler (Admin) veya Sipariş oluştur
	app.All("/api/orders", func(c *fiber.Ctx) error {
		// Query parametrelerini de ilet (pagination için: ?page=1&limit=20)
		queryString := string(c.Request().URI().QueryString())
		url := orderServiceURL + "/orders"
		if queryString != "" {
			url += "?" + queryString
		}
		return proxy.Do(c, url)
	})

	// Search Service (3006)
	app.Use("/api/search", func(c *fiber.Ctx) error {
		url := searchServiceURL + c.OriginalURL()[4:]
		return proxy.Do(c, url)
	})
	// 6. Review Service (YENİ) - Port 3008
	app.Group("/api/reviews", func(c *fiber.Ctx) error {
		// /api/reviews/10 -> http://localhost:3008/reviews/10
		url := reviewServiceURL + "/reviews" + c.Path()[len("/api/reviews"):]
		return proxy.Do(c, url)
	})
	// 7. Wishlist Service (YENİ) - Port 3009
	app.Group("/api/wishlist", func(c *fiber.Ctx) error {
		// /api/wishlist/5 -> http://localhost:3009/wishlist/5
		url := wishlistServiceURL + "/wishlist" + c.Path()[len("/api/wishlist"):]
		return proxy.Do(c, url)
	})

	// 8. Coupon Service - Port 3010
	// Kupon yönetimi ve uygulama endpoint'leri
	app.All("/api/coupons/apply", func(c *fiber.Ctx) error {
		return proxy.Do(c, couponServiceURL+"/coupons/apply")
	})
	app.All("/api/coupons/use", func(c *fiber.Ctx) error {
		return proxy.Do(c, couponServiceURL+"/coupons/use")
	})
	app.All("/api/coupons/:id/stats", func(c *fiber.Ctx) error {
		id := c.Params("id")
		return proxy.Do(c, couponServiceURL+"/coupons/"+id+"/stats")
	})
	app.All("/api/coupons/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		return proxy.Do(c, couponServiceURL+"/coupons/"+id)
	})
	app.All("/api/coupons", func(c *fiber.Ctx) error {
		return proxy.Do(c, couponServiceURL+"/coupons")
	})

	log.Fatal(app.Listen(":8080"))
}
