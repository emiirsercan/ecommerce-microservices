# 🛒 E-Commerce Microservices Platform

[![CI Pipeline](https://github.com/emiirsercan/ecommerce-microservices/actions/workflows/ci.yml/badge.svg)](https://github.com/emiirsercan/ecommerce-microservices/actions/workflows/ci.yml)
![Go Version](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

Modern mikroservis mimarisine sahip, production-ready bir e-ticaret platformu. Go (Fiber) backend, Next.js frontend, ve tam Docker desteği ile geliştirilmiştir.

---

## ✨ Özellikler

- **🏗️ Mikroservis Mimarisi** - 11 bağımsız servis, her biri kendi sorumluluğuna sahip
- **🔐 JWT Authentication** - Güvenli kullanıcı kimlik doğrulama
- **🐰 Event-Driven** - RabbitMQ ile asenkron mesajlaşma
- **🔍 Full-Text Search** - Elasticsearch entegrasyonu
- **📊 Monitoring** - Prometheus + Grafana metrikleri
- **🐳 Docker Ready** - Tek komutla tüm sistem ayağa kalkar
- **🏥 Health Checks** - Servis sağlık kontrolleri
- **🔄 CI/CD** - GitHub Actions ile otomatik build

---

## 🏛️ Sistem Mimarisi

```
                            ┌──────────────────┐
                            │   Next.js App    │
                            │   (Port 3000)    │
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │   API Gateway    │
                            │   (Port 8080)    │
                            │   + Prometheus   │
                            └────────┬─────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
   ┌────▼────┐  ┌────▼────┐  ┌──────▼──────┐  ┌────▼────┐  ┌────▼────┐
   │  Auth   │  │ Product │  │    Order    │  │  Cart   │  │ Search  │
   │ Service │  │ Service │  │   Service   │  │ Service │  │ Service │
   └────┬────┴──┴────┬────┘  └──────┬──────┘  └────┬────┘  └────┬────┘
        │            │              │              │            │
   ┌────▼────────────▼──────┐  ┌───▼───┐     ┌────▼────┐  ┌────▼────┐
   │      PostgreSQL        │  │RabbitMQ│     │  Redis  │  │ Elastic │
   └────────────────────────┘  └───────┘     └─────────┘  └─────────┘
```

---

## 📦 Servisler

| Servis | Port | Teknoloji | Açıklama |
|--------|------|-----------|----------|
| **API Gateway** | 8080 | Go/Fiber | Request routing, CORS, rate limiting |
| **Auth Service** | 3002 | Go/Fiber | JWT auth, kullanıcı yönetimi |
| **Product Service** | 3001 | Go/Fiber | Ürün CRUD, kategori, stok |
| **Order Service** | 3004 | Go/Fiber | Sipariş işlemleri, ödeme |
| **Cart Service** | 3003 | Go/Fiber | Sepet (Redis cache) |
| **Search Service** | 3006 | Go/Fiber | Elasticsearch arama |
| **Review Service** | 3008 | Go/Fiber | Ürün yorumları (MongoDB) |
| **Wishlist Service** | 3009 | Go/Fiber | Favoriler (Redis) |
| **Coupon Service** | 3010 | Go/Fiber | Kupon yönetimi |
| **Payment Service** | 3005 | Go/Fiber | Ödeme simülasyonu |
| **Notification Service** | - | Go | RabbitMQ consumer |

---

## 🛠️ Teknoloji Stack

### Backend
- **Go 1.21+** - Ana programlama dili
- **Fiber v2** - Hızlı HTTP framework
- **GORM** - PostgreSQL ORM
- **JWT** - Kimlik doğrulama
- **RabbitMQ** - Message broker

### Frontend
- **Next.js 15** - React framework
- **React 19** - UI library
- **TailwindCSS** - Styling
- **shadcn/ui** - UI components

### Altyapı
- **Docker & Docker Compose** - Containerization
- **PostgreSQL** - Ana veritabanı
- **Redis** - Cache & session
- **MongoDB** - Review storage
- **Elasticsearch** - Full-text search
- **Prometheus + Grafana** - Monitoring

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Docker & Docker Compose
- Git

### Kurulum

```bash
# 1. Repo'yu klonla
git clone https://github.com/emiirsercan/ecommerce-microservices.git
cd ecommerce-microservices

# 2. Tüm servisleri başlat
docker-compose up --build

# 3. Tarayıcıda aç
# Frontend: http://localhost:3000
# API: http://localhost:8080
```

### Erişim Noktaları

| Servis | URL |
|--------|-----|
| 🌐 Frontend | http://localhost:3000 |
| 🔌 API Gateway | http://localhost:8080 |
| 🐰 RabbitMQ Panel | http://localhost:15672 |
| 📊 Prometheus | http://localhost:9090 |
| 📈 Grafana | http://localhost:3007 |

---

## 📡 API Endpoints

### Authentication
```
POST /api/auth/register    # Kullanıcı kaydı
POST /api/auth/login       # Giriş
GET  /api/auth/me          # Profil bilgisi
```

### Products
```
GET    /api/products       # Ürün listesi (pagination)
GET    /api/products/:id   # Ürün detayı
POST   /api/products       # Ürün ekle (Admin)
PUT    /api/products/:id   # Ürün güncelle
DELETE /api/products/:id   # Ürün sil
```

### Orders
```
GET  /api/orders           # Tüm siparişler (Admin)
GET  /api/orders/user/:id  # Kullanıcı siparişleri
POST /api/orders           # Sipariş oluştur
```

### Search
```
GET /api/search?q=keyword  # Ürün ara
```

### Health Check
```
GET /health                # Her servis için sağlık kontrolü
```

---

## 🔧 Geliştirme

### Lokal Geliştirme (Docker olmadan)

```bash
# Sadece altyapıyı başlat
docker-compose up -d postgres redis rabbitmq elasticsearch mongo

# Servisi çalıştır
cd product-service && go run main.go
```

### Test

```bash
# Tüm servislerin health check'i
curl http://localhost:8080/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

---

## 📁 Proje Yapısı

```
ecommerce-microservices/
├── api-gateway/          # API Gateway servisi
├── auth-service/         # Kimlik doğrulama
├── product-service/      # Ürün yönetimi
├── order-service/        # Sipariş işlemleri
├── cart-service/         # Sepet (Redis)
├── search-service/       # Elasticsearch arama
├── review-service/       # Yorumlar (MongoDB)
├── wishlist-service/     # Favoriler
├── coupon-service/       # Kupon yönetimi
├── payment-service/      # Ödeme simülasyonu
├── notification-service/ # Bildirimler
├── client/               # Next.js frontend
├── pkg/                  # Shared packages
├── infra/                # Infra configs
├── .github/workflows/    # CI/CD pipeline
└── docker-compose.yml    # Docker orchestration
```

---

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'feat: add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

---

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

<p align="center">
  Made with ❤️ using Go & Next.js
</p>
