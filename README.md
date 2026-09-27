# 文件解析審核前端

上傳文件 → 後端解析（SSE 逐筆串流）→ 使用者確認與修改

## 目錄結構

| 路徑 | 內容 |
|---|---|
| `app/` | 後端（出題方提供）與 `docker-compose.yml` |
| `app/frontend/` | 前端專案 |
| `subject/` | 題目文件、參考介面圖、範例 PDF |
| `log/` | 開發紀錄 |

---

## 目前進度

| 項目 | 狀態 |
|---|---|
| 依賴選型與實測 | ✅ 完成 |
| 專案骨架與工具鏈 | ✅ 完成 |
| Docker 整合 | ✅ 完成 |
| API 與 SSE 型別定義 | ✅ 完成 |
| SSE 傳輸層 | ⬜ 未開始 |
| 上傳 / 解析中 / 資料審核 | ⬜ 未開始 |
| 測試 | ⬜ 未開始 |
| 無障礙、跨裝置 | ⬜ 未開始 |
| 題目指定的 README 問答 | ⬜ 未撰寫 |

目前 `src/App.vue` 只有外框，`src/stores/api.ts` 只有空的 store，尚無功能實作

---

## 快速開始

### Docker

```bash
cd app
docker compose up --build
```

| 服務 | 網址 |
|---|---|
| 前端（nginx） | http://localhost:5173 |
| 後端 API | http://localhost:8000 |

### 本機開發

後端：

```bash
cd app
pip install -r requirements.txt
uvicorn server:app --reload
```

前端：

```bash
cd app/frontend
npm install
npx playwright install chromium   # 測試在真瀏覽器裡跑，需要下載 Chromium（約 115 MB）

npm run dev        # 開發伺服器 http://localhost:5173
npm run lint
npm run format
npm run test       # Vitest browser mode，目前尚無測試檔
npm run build      # 先以 vue-tsc 做型別檢查再建置
```

後端網址預計由 `app/frontend/.env` 的 `VITE_API_URL` 設定（`http://localhost:8000`），程式碼尚未讀取此變數

---

## 技術選型

### 執行期依賴

| 套件 | 版本 | 用途 |
|---|---|---|
| `vue` | 3.5.43 | 框架（題目指定） |
| `pinia` | 4.0.3 | 狀態管理 |
| `vue-router` | 5.3.1 | 路由 |

### 開發依賴

| 套件 | 版本 | 用途 |
|---|---|---|
| `vite` / `@vitejs/plugin-vue` | 8.3.0 / 6.0.9 | 建置 |
| `typescript` | **~6.0.3** | 題目指定，鎖 minor（[原因](log/01-typescript-版本鎖定.md)） |
| `vue-tsc` | 3.3.11 | SFC 型別檢查，`tsc` 看不懂 `.vue` |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | 題目指定，v4 走 Vite plugin |
| `vitest` / `@vitest/browser` | 5.0.1 | 測試 |
| `@vitest/browser-playwright` / `playwright` | 5.0.1 / 1.63.0 | 瀏覽器 provider |
| `vitest-browser-vue` | 3.1.0 | 元件渲染，locator 內建重試 |
| `@vitest/coverage-v8` | 5.0.1 | 覆蓋率 |
| `eslint` / `eslint-plugin-vue` / `typescript-eslint` | 10.10.0 / 10.11.0 / 8.70.0 | 靜態檢查 |
| `prettier` / `prettier-plugin-tailwindcss` | 3.9.8 / 0.8.1 | 格式與 class 排序 |
| `eslint-config-prettier` | 10.1.8 | 關閉與 Prettier 衝突的 ESLint 規則 |
