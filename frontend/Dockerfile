# ---- build ----
# node:24 對齊開發機的 v24.20。不是因為容器依賴主機環境（build 全程在容器裡跑，
# 主機沒裝 node 也建得起來），而是要讓本機驗過的行為能在容器裡重現 ——
# major 版本不一致時，會出現本機 vue-tsc 過、容器 vue-tsc 炸這種只在 build log 裡看得到的落差
FROM node:24-alpine AS build

WORKDIR /app

# 先只複製 lock，讓 npm ci 這層能被快取住：改 src/ 不會重裝依賴，
# 只有 package-lock.json 變動才會
COPY package.json package-lock.json ./

# 不能加 --omit=dev：vite、vue-tsc、tailwind 全在 devDependencies，
# 少了它們這個階段根本 build 不出東西。
# 用 npm ci 而不是 npm install 是因為它只認 lock 檔，對不上就報錯，
# 不會自作主張改寫 —— 這是「別人 build 出來跟你一樣」的主要保證
RUN npm ci

COPY . .

# 後端位址從 compose 的 build args 進來，ARG 的值在 build 期間對 RUN 可見。
# 放在 npm ci 後面：改這個值只會讓 npm run build 重跑，不會連依賴一起重裝
ARG VITE_API_BASE

# build script 是 vue-tsc --noEmit && vite build，
# 型別錯誤會讓映像建不起來 —— 刻意留著，壞掉的東西不該打包成功
RUN npm run build

# ---- serve ----
# 只帶走 dist。node、npm 與那包依賴全部留在上一階段，不進成品
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
