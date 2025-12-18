# Build Stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Bağımlılıkları kopyala ve indir
COPY go.mod go.sum ./
RUN go mod download

# Kaynak kodunu kopyala
COPY . .

# Uygulamayı derle
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./api-gateway

# Run Stage
FROM alpine:latest

WORKDIR /root/

# Builder aşamasından binary dosyasını kopyala
COPY --from=builder /app/main .

# Gerekli portu aç (Bu değer docker-compose'dan da yönetilebilir ama burada belirtmek iyidir)
# EXPOSE 8080 
# (Her servis farklı port kullanıyor, docker-compose ile mapleyeceğiz)

CMD ["./main"]
