# 🛒 E-Commerce Microservices Backend

Go (Fiber) ve Next.js ile geliştirilmiş mikroservis mimarisine sahip bir e-ticaret uygulaması.

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                     │
│                        localhost:3000                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    API GATEWAY (Fiber)                      │
│                      localhost:8080                         │
│               Prometheus Metrics: /metrics                  │
└───┬─────────┬─────────┬─────────┬─────────┬─────────┬───────┘
    │         │         │         │         │         │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│ Auth  │ │Product│ │ Cart  │ │ Order │ │Search │ │Notif. │
│ :3002 │ │ :3001 │ │ :3003 │ │ :3004 │ │ :3006 │ │ :3005 │
└───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘
```

## 🛠️ Teknolojiler

**Backend:**
- Go + Fiber Framework
- GORM (PostgreSQL ORM)
- JWT Authentication
- RabbitMQ (Event-driven messaging)
- Elasticsearch (Full-text search)
- Prometheus + Grafana (Monitoring)

**Frontend:**
- Next.js 15 + React 19
- TailwindCSS
- shadcn/ui

**Infrastructure:**
- Docker & Docker Compose
- PostgreSQL
- Redis
- RabbitMQ
- Elasticsearch

## 📦 Servisler

| Servis | Port | Açıklama |
|--------|------|----------|
| API Gateway | 8080 | Tüm istekleri yönlendirir, CORS yönetimi |
| Auth Service | 3002 | Kullanıcı kayıt/giriş, JWT token |
| Product Service | 3001 | Ürün CRUD, stok yönetimi |
| Cart Service | 3003 | Sepet işlemleri (Redis cache) |
| Order Service | 3004 | Sipariş oluşturma, ödeme entegrasyonu |
| Payment Service | 3005 | Ödeme simülasyonu |
| Search Service | 3006 | Elasticsearch ile ürün arama |
| Notification Service | - | RabbitMQ ile bildirim gönderimi |

## 🚀 Kurulum

### Gereksinimler
- Go 1.21+
- Node.js 18+
- Docker & Docker Compose

### 1. Projeyi Klonla
```bash
git clone https://github.com/KULLANICI_ADI/ecommerce-backend.git
cd ecommerce-backend
```

### 2. Environment Değişkenlerini Ayarla
```bash
cp .env.example .env
# .env dosyasını düzenle
```

### 3. Docker Servislerini Başlat
```bash
docker-compose up -d
```

Bu komut şunları başlatır:
- PostgreSQL (5432)
- Redis (6379)
- RabbitMQ (5672, Panel: 15672)
- Elasticsearch (9200)
- Prometheus (9090)
- Grafana (3007)

### 4. Go Bağımlılıklarını Yükle
```bash
go mod download
```

### 5. Servisleri Başlat (Ayrı terminallerde)
```bash
# Terminal 1 - API Gateway
cd api-gateway && go run main.go

# Terminal 2 - Auth Service
cd auth-service && go run main.go

# Terminal 3 - Product Service
cd product-service && go run main.go

# Terminal 4 - Cart Service
cd cart-service && go run main.go

# Terminal 5 - Order Service
cd order-service && go run main.go

# Terminal 6 - Search Service
cd search-service && go run main.go
```

### 6. Frontend'i Başlat
```bash
cd client
npm install
npm run dev
```

## 🔗 Erişim Linkleri

| Servis | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:8080 |
| RabbitMQ Panel | http://localhost:15672 (guest/guest) |
| Grafana | http://localhost:3007 |
| Prometheus | http://localhost:9090 |

## 📝 API Endpoints

### Auth (`/api/auth`)
- `POST /register` - Kayıt ol
- `POST /login` - Giriş yap

### Products (`/api/products`)
- `GET /` - Tüm ürünleri listele
- `GET /:id` - Ürün detayı
- `POST /` - Ürün ekle (Auth gerekli)

### Cart (`/api/cart`)
- `GET /:userId` - Sepeti getir
- `POST /add` - Sepete ekle
- `DELETE /:userId/:productId` - Sepetten sil

### Orders (`/api/orders`)
- `POST /` - Sipariş oluştur
- `GET /user/:userId` - Kullanıcı siparişleri

### Search (`/api/search`)
- `GET /?q=keyword` - Ürün ara

## 📄 Lisans

MIT

