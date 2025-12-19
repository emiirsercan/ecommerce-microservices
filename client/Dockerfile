# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Bağımlılıkları kopyala ve yükle
COPY package.json package-lock.json ./
RUN npm ci

# Kaynak kodunu kopyala
COPY . .

# Next.js uygulamasını derle
RUN npm run build

# Run Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

# Builder aşamasından gerekli dosyaları kopyala
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Port ayarı (Default 3000)
EXPOSE 3000

# Next.js standalone modunu başlat
CMD ["node", "server.js"]
