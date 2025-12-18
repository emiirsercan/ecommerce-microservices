# Build Stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Bağımlılıkları kopyala ve indir
COPY go.mod go.sum ./
RUN go mod download

# Kaynak kodunu kopyala
COPY . .

# Önce klasöre gir (cd), sonra derle (.) ve çıktıyı üst dizine at (../main)
RUN cd review-service && CGO_ENABLED=0 GOOS=linux go build -o ../main .

# Run Stage
FROM alpine:latest

WORKDIR /root/

# Builder aşamasından binary dosyasını kopyala
COPY --from=builder /app/main .

CMD ["./main"]
