# 文件解析審核前端

上傳文件 → 後端解析（SSE 逐筆串流）→ 使用者確認與修改

- 後端：`mock-backend/`（出題方提供）
- 前端：`frontend/`
- 開發紀錄：`log/`

---

## 目前進度

| 項目 | 狀態 | 範圍 |
|---|---|---|
| 依賴選型與實測 | ✅ 完成 |  |
| 專案骨架與工具鏈 | ✅ 完成 |  |
| SSE 傳輸層 | ⬜ 未開始 |  |
| 上傳 / 解析中 / 資料審核 | ⬜ 未開始 | |
| 無障礙、跨裝置 | ⬜ 未開始 |  |
| 題目指定的 README 問答 | ⬜ 未撰寫 |  |

目前 `src/App.vue` 只有外框，沒有任何功能實作

---

## 快速開始

```bash
cd frontend
npm install
npx playwright install chromium   # 測試在真瀏覽器裡跑，需要下載 Chromium（約 115 MB）

npm run dev        # 開發伺服器 http://localhost:5173
npm run lint
npm run test       # Vitest browser mode
npm run build
```

後端另外啟動：

```bash
cd mock-backend && docker compose up
```

---

## 技術選型

### 已安裝

| 套件 | 版本 | 用途 |
|---|---|---|
| `vue` | 3.5.43 | 框架（題目指定） |
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

執行期依賴有 `vue` 和 `Pinia`

---
