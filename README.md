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

### 3. Docker ile Tüm Uygulamayı Başlat (Önerilen)
```bash
docker-compose up --build
```

Bu komut:
- Tüm veritabanlarını (PostgreSQL, Redis, Mongo, Elastic)
- Tüm mikroservisleri (Go API'leri)
- Frontend uygulamasını (Next.js)
tek seferde ayağa kaldırır.

### Erişim:
- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **API Gateway:** [http://localhost:8080](http://localhost:8080)

---

### Alternatif: Manuel Geliştirme Ortamı (Eski Yöntem)

Eğer servisleri tek tek geliştirmek istiyorsanız:

1. Altyapıyı Başlat:
```bash
docker-compose -f docker-compose.infra.yml up -d
# (Not: Sadece DB'ler için ayrı bir compose dosyası gerekebilir veya mevcut dosyadan ilgili servisleri seçebilirsiniz)
# Örn: docker-compose up -d postgres redis rabbitmq elasticsearch mongo
```

2. Servisleri Başlat (Ayrı terminallerde):
```bash
# Terminal 1 - API Gateway
cd api-gateway && go run main.go

# Terminal 2 - Auth Service
cd auth-service && go run main.go

# ... Diğer servisler ...
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

