# 文件解析審核前端

上傳文件 → 後端解析（SSE 逐筆串流）→ 使用者確認與修改 — 前端實作題的作答倉庫

- 後端：`mock-backend/`（出題方提供，`server.py` 未修改）
- 前端：`frontend/`
- **架構說明：[ARCHITECTURE.md](ARCHITECTURE.md)** — 檔案配置、資料流、狀態機、store 依賴關係、元件規劃
- 開發紀錄：`log/`

---

## 目前進度

| 項目                     | 狀態      | 範圍                                                                                                                        |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| 依賴選型與實測           | ✅ 完成   | 見「決策與開發歷程」                                                                                                        |
| 專案骨架與工具鏈         | ✅ 完成   | typecheck / lint / build / test / dev 五項皆通過                                                                            |
| 型別與領域規則           | ✅ 完成   | `ExtractedField` / `FieldDraft` 分離，狀態判準單一來源（[說明](ARCHITECTURE.md#srctypesfieldts--領域型別與唯一的狀態判準)）     |
| SSE 傳輸層               | ✅ 完成   | `fetch` ＋ `ReadableStream`，可注入介面、依 HTTP 狀態碼分流（[說明](ARCHITECTURE.md#srcapifetchstreamtransportts--預設傳輸層)） |
| 狀態與 composable        | ✅ 完成   | `useReviewStore` / `useExtraction` / `useFieldFilters`（[依賴圖](ARCHITECTURE.md#store-依賴關係)）                              |
| 上傳 / 解析中 / 審核介面 | ⬜ 未開始 | 三個階段，元件規劃見 [ARCHITECTURE.md](ARCHITECTURE.md#元件配置規劃尚未建立)                                                        |
| 防護性測試               | ✅ 45 支  | SSE 分幀、HTTP 狀態分流、中止、解析中途失敗、必填缺漏擋送出、候選答案挑選、重設（[清單](ARCHITECTURE.md#測試防的是什麼)）       |
| Docker 整合              | 🟡 已建立 | 根目錄 `docker-compose.yml` ＋ `frontend/Dockerfile`（多階段 build → nginx），**尚未實跑驗證** |
| 虛擬捲動                 | ⬜ 未決定 | 先用 `?field_count=300` 量測是否真的卡                                                                                      |
| 無障礙、跨裝置           | ⬜ 未開始 | 題目列為加分項                                                                                                              |
| 題目指定的 README 問答   | ⬜ 未撰寫 | 九項，見文末清單                                                                                                            |

資料層（型別、傳輸、狀態）已完成並有測試覆蓋，但 `src/App.vue` 仍只有外框，尚未接上任何一支 composable

---

## 快速開始

三套跑法，用途不同

### 一、日常開發

改程式碼走這條，存檔立刻看得到：

```bash
docker compose up -d api          # 只起後端，http://localhost:8000
cd frontend && npm run dev        # http://localhost:5173，熱更新
```

指定服務名 `api` 是必要的 —— 不指定會把 `web` 一起拉起來，多等一輪 build 卻完全用不到：它 serve 的是 build 當下凍結的產物，改了 `src/` 也不會變。後端日誌看 `docker compose logs -f api`

前端第一次要先裝：

```bash
cd frontend
npm install
npx playwright install chromium   # 測試在真瀏覽器裡跑，需要下載 Chromium（約 115 MB）
```

其餘指令：

```bash
npm run typecheck  # vue-tsc --noEmit
npm run lint
npm run test       # Vitest browser mode
npm run build
```

### 二、交付驗證

評審打開時看到的東西，跟這條路徑跑出來的一致：

```bash
docker compose up --build         # http://localhost:8080
```

前端是 `npm run build` 的產物交給 nginx，不是 dev server。有五件事只有走這條路徑才驗得到：`VITE_API_BASE` 真的被替換進 bundle、`vue-tsc` 沒被跳過、SSE 沒被中間層緩衝、上傳大檔沒被擋、api 還沒就緒時開頁面會怎樣

`web` 刻意不佔 5173，理由見 `docker-compose.yml` 的註解

### 三、交件前跑一次

```bash
git clone . ../verify && cd ../verify && docker compose up --build
```

從 clone 出來的副本跑，build context 裡只有 git 追蹤到的檔案。這一步專門擋「本機 build 得過，是因為 context 裡有沒提交進 git 的檔案」那一類問題 —— 快取和工作目錄會一路掩護到交件為止

---

## 技術選型

### 已安裝

| 套件                                                 | 版本                       | 用途                                                        |
| ---------------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| `vue`                                                | 3.5.43                     | 框架（題目指定）                                            |
| `vite` / `@vitejs/plugin-vue`                        | 8.3.0 / 6.0.9              | 建置                                                        |
| `typescript`                                         | **~6.0.3**                 | 題目指定，鎖 minor（[原因](log/01-typescript-版本鎖定.md)） |
| `vue-tsc`                                            | 3.3.11                     | SFC 型別檢查，`tsc` 看不懂 `.vue`                           |
| `tailwindcss` / `@tailwindcss/vite`                  | 4.3.3                      | 題目指定，v4 走 Vite plugin                                 |
| `vitest` / `@vitest/browser`                         | 5.0.1                      | 測試                                                        |
| `@vitest/browser-playwright` / `playwright`          | 5.0.1 / 1.63.0             | 瀏覽器 provider                                             |
| `vitest-browser-vue`                                 | 3.1.0                      | 元件渲染，locator 內建重試                                  |
| `@vitest/coverage-v8`                                | 5.0.1                      | 覆蓋率                                                      |
| `eslint` / `eslint-plugin-vue` / `typescript-eslint` | 10.10.0 / 10.11.0 / 8.70.0 | 靜態檢查                                                    |
| `prettier` / `prettier-plugin-tailwindcss`           | 3.9.8 / 0.8.1              | 格式與 class 排序                                           |

執行期依賴只有 `vue` 一個

### 刻意不裝

| 套件                  | 理由                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pinia`               | 整個流程是單一文件的單一狀態機，一支 composable 就涵蓋，多一層只是把 `ref` 換個地方放                                  |
| `vue-router`          | 上傳→解析→審核是同一頁的三個狀態，不是三個網址；後端重啟後 `document_id` 即失效，做持久化也留不住                      |
| `@vueuse/core`        | 真正會用到的大概一兩個函式，自己寫十行更清楚                                                                           |
| UI 元件庫             | 題目要看的是資訊層級的判斷，元件庫的預設樣式會直接蓋掉這件事                                                           |
| `zod`                 | 必填規則由後端 `required` 旗標決定且欄位是動態的，schema 反而繞路                                                      |
| `msw`                 | 假後端改用 Vite middleware，省一層依賴且樣式與互動可測（[比較](log/03-msw-中止驗證.md)）                               |
| `eventsource`         | 傳輸層改用 `fetch` ＋ `ReadableStream`，SSE 分幀自己寫（[理由](ARCHITECTURE.md#srcapifetchstreamtransportts--預設傳輸層)） |
| `happy-dom` / `jsdom` | 同上，不再需要模擬 DOM                                                                                                 |

`@tanstack/vue-virtual`（虛擬捲動）尚未決定，打算先用 `?field_count=300` 實測是否真的卡，再決定要不要為此犧牲瀏覽器原生的 Ctrl+F 搜尋

---

## 決策與開發歷程

> 本專案在 AI 協作下進行，此表記錄每項決策的結果與人工介入程度，實測數據、程式碼與判斷過程放在 `log/`

| #   | 決策            | 結果                                           | 人工介入     | 紀錄                                                         |
| --- | --------------- | ---------------------------------------------- | ------------ | ------------------------------------------------------------ |
| 01  | TypeScript 版本 | 鎖 `~6.0.3`，因為 7.x 會讓 `vue-tsc` 崩潰      | 無           | [詳細](log/01-typescript-版本鎖定.md)                        |
| 02  | 測試環境        | Vitest browser mode + Playwright，不用模擬 DOM | **指定方向** | [詳細](log/02-測試環境選型.md)                               |
| 03  | 假後端          | Vite middleware，不用 MSW                      | **推翻結論** | [詳細](log/03-msw-中止驗證.md)                               |
| 04  | 專案骨架        | 工具鏈五項檢查全綠                             | 指定範圍     | [詳細](log/04-骨架建置與驗證.md)                             |
| 05  | 執行期依賴      | 只留 `vue`                                     | 無           | —                                                            |
| 06  | Docker 整合     | compose 移至根目錄，前端 build 產物交給 nginx，不反代 | **選定方案** | [詳細](log/06-docker-整合.md)                                |
| 07  | 虛擬捲動        | 延後，需先用 300 欄位實測                      | 無           | —                                                            |
| 08  | SSE 傳輸方式    | `EventSource` → `fetch` ＋ `ReadableStream`    | **指定方向** | [詳細](ARCHITECTURE.md#srcapifetchstreamtransportts--預設傳輸層) |
| 09  | 後端位址設定    | 預設值移入 `.env`，程式碼不做執行期判斷        | **指出矛盾** | [詳細](ARCHITECTURE.md#srcapihttpts--位址與錯誤型別)         |

### 人工介入的三處修正

這三處是 AI 的判斷被人工改掉的地方，對最終架構有實質影響：

**一、Vitest + happy-dom → Playwright browser mode**（[log/02](log/02-測試環境選型.md)）

AI 一開始把 Vitest + happy-dom 當成既定前提在推論，但題目只寫「測試至少一支」，從未指定測試工具 — 那是 AI 自己的選擇卻沒有標示成選擇

人工指出這點後，重新攤開所有選項並指定改用 browser mode，結果是不再需要 `happy-dom`、`jsdom`、`eventsource` polyfill 三個依賴，`EventSource` 直接用原生的，而且樣式與真實鍵盤事件變成可驗證

> 後來決策 08 把傳輸層從 `EventSource` 換成 `fetch` ＋ `ReadableStream`，這裡「原生 `EventSource`」的論據已被取代。browser mode 的結論不變，但理由換成 `fetch`／`ReadableStream`／`TextDecoder` 都是原生的、`AbortController.abort()` 會真的讓後端收到斷線

**二、MSW 中止驗證：`ReadableStream.cancel()` → `request.signal`**（[log/03](log/03-msw-中止驗證.md)）

AI 實測後判定「MSW 驗證不了中止契約」，並以此作為捨棄 MSW 的主要理由

人工提問能否改監聽 `request.signal.aborted`，指出 AI 測錯了掛鉤 — MSW 不是透過 `ReadableStream.cancel()` 傳遞中止；重測確認 `request.signal` 完全有效，伺服器確實會停止產出

原本的推薦理由因此不成立，最終仍維持 browser mode，但理由換成「原生 API 無 polyfill 落差、樣式與互動可測」，而不是「MSW 做不到」

**三、`VITE_API_BASE` 的存在理由寫錯了**（決策 09）

AI 給這個環境變數寫的理由是「進 docker compose 之後服務名會變」，`http.ts` 與 `ARCHITECTURE.md` 兩處都這麼寫

人工指出這句話自相矛盾：發出請求的是使用者的**瀏覽器**，它跑在主機上、不在 compose 網路裡，解析不到 `api` 這個名字。照原句的暗示把值改成 `http://api:8000`，前端會直接連不上後端

環境變數的結論不變，但理由換成真正成立的三種情況：8000 被佔走而改了 `ports`、從區域網路另一台裝置連 `vite --host` 開出來的頁面、部署到 localhost 以外的位址

人工接著指出它是 build-time 的靜態值，執行期沒有「有沒有設」可判斷。於是預設值移進 `frontend/.env`，程式碼從 `(import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')` 簡化成直接讀取，並在 `env.d.ts` 補上 `ImportMetaEnv` 讓型別從 `any` 變成 `string`

> 這件事替決策 06（Docker 整合）先定了一條限制：這個值**不能**用 compose 的 `environment:` 注入，那對已經打包好的靜態檔沒有作用，得在 build 那一步就給 —— 已落實，見 [log/06](log/06-docker-整合.md)

### 其他過程中的錯誤

回報套件安裝成功時讀的是 `tail` 的 exit code 而非 npm 的，導致 devDependencies 整批失敗卻回報成功，細節見 [log/04](log/04-骨架建置與驗證.md)

---

## 題目指定的 README 項目（尚未撰寫）

- [ ] `AI產生的介面_參考.png` 最嚴重的三個問題，以及自己的版本怎麼處理
- [ ] 怎麼驗證這東西真的能動 — 實際試過哪些情況、怎麼試的、試出什麼問題
- [ ] 哪些是 AI 寫的、改了什麼、為什麼改
- [ ] 這份 code 裡最不確定的是哪一段
- [ ] 需求哪裡沒講清楚、如何假設
- [ ] 決定不顯示或降級顯示哪些資訊
- [ ] 哪兩條需求互相衝突、如何取捨
- [ ] 決定不做什麼
- [ ] 想問的三個問題

## 規格未提到的部分
- 低把握度的界線 `0.7`
