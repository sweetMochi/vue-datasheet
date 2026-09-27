# 建置階段：在容器內重新安裝依賴，不沿用主機（Windows）裝的原生執行檔
FROM node:24-alpine AS build
WORKDIR /app

# 測試用的 Chromium 在建置時用不到，不下載
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# 執行階段：只保留建置產物，由 nginx 提供靜態檔
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
