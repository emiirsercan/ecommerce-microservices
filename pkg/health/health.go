/*
Package health - Mikroservisler için Health Check Modülü

Bu paket, tüm servislerimizde kullanılacak ortak health check
fonksiyonlarını içerir. Kubernetes'te liveness ve readiness
probe'ları için kullanılır.

Kullanım:

	checker := health.NewHealthChecker()
	checker.AddCheck("postgres", health.NewPostgresChecker(db))
	checker.AddCheck("rabbitmq", health.NewRabbitMQChecker(conn))

	result := checker.Check()
	// result.Status = "healthy" veya "unhealthy"
*/
package health

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
)

// ==============================================================================
// TİP TANIMLARI
// ==============================================================================

// CheckResult - Tek bir health check sonucu
type CheckResult struct {
	Status   string        `json:"status"`   // "healthy" veya "unhealthy"
	Message  string        `json:"message"`  // Detay mesajı
	Duration time.Duration `json:"duration"` // Kontrol süresi
}

// HealthResponse - Tüm kontrollerin toplu sonucu
type HealthResponse struct {
	Status    string                 `json:"status"`    // Genel durum
	Timestamp time.Time              `json:"timestamp"` // Kontrol zamanı
	Service   string                 `json:"service"`   // Servis adı
	Checks    map[string]CheckResult `json:"checks"`    // Her bir kontrol sonucu
}

// Checker - Her bağımlılık için implement edilecek interface
type Checker interface {
	Check(ctx context.Context) CheckResult
}

// HealthChecker - Ana health check yöneticisi
type HealthChecker struct {
	serviceName string
	checkers    map[string]Checker
}

// ==============================================================================
// HEALTH CHECKER
// ==============================================================================

// NewHealthChecker - Yeni health checker oluşturur
func NewHealthChecker(serviceName string) *HealthChecker {
	return &HealthChecker{
		serviceName: serviceName,
		checkers:    make(map[string]Checker),
	}
}

// AddCheck - Yeni bir kontrol ekler
func (h *HealthChecker) AddCheck(name string, checker Checker) {
	h.checkers[name] = checker
}

// Check - Tüm kontrolleri çalıştırır
func (h *HealthChecker) Check() HealthResponse {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		Service:   h.serviceName,
		Checks:    make(map[string]CheckResult),
	}

	for name, checker := range h.checkers {
		result := checker.Check(ctx)
		response.Checks[name] = result
		if result.Status != "healthy" {
			response.Status = "unhealthy"
		}
	}

	return response
}

// FiberHandler - Fiber için /health endpoint handler'ı
func (h *HealthChecker) FiberHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		result := h.Check()
		statusCode := http.StatusOK
		if result.Status != "healthy" {
			statusCode = http.StatusServiceUnavailable
		}
		return c.Status(statusCode).JSON(result)
	}
}

// ==============================================================================
// POSTGRES CHECKER
// ==============================================================================

type PostgresChecker struct {
	db *sql.DB
}

// NewPostgresChecker - SQL db için checker (GORM'dan *sql.DB alınabilir)
func NewPostgresChecker(db *sql.DB) *PostgresChecker {
	return &PostgresChecker{db: db}
}

func (p *PostgresChecker) Check(ctx context.Context) CheckResult {
	start := time.Now()

	if p.db == nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  "database connection is nil",
			Duration: time.Since(start),
		}
	}

	err := p.db.PingContext(ctx)
	if err != nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  fmt.Sprintf("ping failed: %v", err),
			Duration: time.Since(start),
		}
	}

	return CheckResult{
		Status:   "healthy",
		Message:  "database connection OK",
		Duration: time.Since(start),
	}
}

// ==============================================================================
// REDIS CHECKER
// ==============================================================================

type RedisChecker struct {
	client *redis.Client
}

func NewRedisChecker(client *redis.Client) *RedisChecker {
	return &RedisChecker{client: client}
}

func (r *RedisChecker) Check(ctx context.Context) CheckResult {
	start := time.Now()

	if r.client == nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  "redis client is nil",
			Duration: time.Since(start),
		}
	}

	_, err := r.client.Ping(ctx).Result()
	if err != nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  fmt.Sprintf("ping failed: %v", err),
			Duration: time.Since(start),
		}
	}

	return CheckResult{
		Status:   "healthy",
		Message:  "redis connection OK",
		Duration: time.Since(start),
	}
}

// ==============================================================================
// RABBITMQ CHECKER
// ==============================================================================

type RabbitMQChecker struct {
	conn *amqp.Connection
}

func NewRabbitMQChecker(conn *amqp.Connection) *RabbitMQChecker {
	return &RabbitMQChecker{conn: conn}
}

func (r *RabbitMQChecker) Check(ctx context.Context) CheckResult {
	start := time.Now()

	if r.conn == nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  "rabbitmq connection is nil",
			Duration: time.Since(start),
		}
	}

	if r.conn.IsClosed() {
		return CheckResult{
			Status:   "unhealthy",
			Message:  "rabbitmq connection is closed",
			Duration: time.Since(start),
		}
	}

	return CheckResult{
		Status:   "healthy",
		Message:  "rabbitmq connection OK",
		Duration: time.Since(start),
	}
}

// ==============================================================================
// MONGODB CHECKER
// ==============================================================================

type MongoChecker struct {
	client *mongo.Client
}

func NewMongoChecker(client *mongo.Client) *MongoChecker {
	return &MongoChecker{client: client}
}

func (m *MongoChecker) Check(ctx context.Context) CheckResult {
	start := time.Now()

	if m.client == nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  "mongo client is nil",
			Duration: time.Since(start),
		}
	}

	err := m.client.Ping(ctx, nil)
	if err != nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  fmt.Sprintf("ping failed: %v", err),
			Duration: time.Since(start),
		}
	}

	return CheckResult{
		Status:   "healthy",
		Message:  "mongodb connection OK",
		Duration: time.Since(start),
	}
}

// ==============================================================================
// ELASTICSEARCH CHECKER (HTTP-based)
// ==============================================================================

type ElasticsearchChecker struct {
	url string
}

func NewElasticsearchChecker(url string) *ElasticsearchChecker {
	return &ElasticsearchChecker{url: url}
}

func (e *ElasticsearchChecker) Check(ctx context.Context) CheckResult {
	start := time.Now()

	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", e.url+"/_cluster/health", nil)
	if err != nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  fmt.Sprintf("request creation failed: %v", err),
			Duration: time.Since(start),
		}
	}

	resp, err := client.Do(req)
	if err != nil {
		return CheckResult{
			Status:   "unhealthy",
			Message:  fmt.Sprintf("request failed: %v", err),
			Duration: time.Since(start),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return CheckResult{
			Status:   "unhealthy",
			Message:  fmt.Sprintf("unexpected status: %d", resp.StatusCode),
			Duration: time.Since(start),
		}
	}

	return CheckResult{
		Status:   "healthy",
		Message:  "elasticsearch cluster OK",
		Duration: time.Since(start),
	}
}

// ==============================================================================
// SELF CHECKER (Basit kontrol - servisin kendisi çalışıyor mu?)
// ==============================================================================

type SelfChecker struct{}

func NewSelfChecker() *SelfChecker {
	return &SelfChecker{}
}

func (s *SelfChecker) Check(ctx context.Context) CheckResult {
	return CheckResult{
		Status:   "healthy",
		Message:  "service is running",
		Duration: 0,
	}
}
