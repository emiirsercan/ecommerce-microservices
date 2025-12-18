# Build Stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Bağımlılıkları kopyala ve indir
COPY go.mod go.sum ./
RUN go mod download

# Kaynak kodunu kopyala
COPY . .

# Uygulamayı derle
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./product-service

# Run Stage
FROM alpine:latest

WORKDIR /root/

# Builder aşamasından binary dosyasını kopyala
COPY --from=builder /app/main .

# Wait-for scripti eklenebilir ama modern docker-compose 'healthcheck' ile bu daha temiz yapılıyor.
# Biz docker-compose healthcheck kullanacağız.

CMD ["./main"]
