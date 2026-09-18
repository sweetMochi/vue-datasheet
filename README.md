# 文件解析審核前端

上傳文件 → 後端解析（SSE 逐筆串流）→ 使用者確認與修改 — 前端實作題的作答倉庫

- 後端：`mock-backend/`（出題方提供，`server.py` 未修改）
- 前端：`frontend/`

---

## 目前進度

| 階段 | 狀態 |
|---|---|
| 依賴選型與實測 | ✅ 完成 |
| 專案骨架與工具鏈 | ✅ 完成 |
| SSE 傳輸層 | ⬜ 未開始 |
| 上傳 / 解析 / 審核介面 | ⬜ 未開始 |
| 測試（防護性） | ⬜ 僅有環境冒煙測試 |
| Docker 整合 | ⬜ 未開始 |
| 題目指定的 README 問答 | ⬜ 未撰寫，見文末清單 |

目前 `src/App.vue` 只有外框，沒有任何功能實作

---

## 快速開始

```bash
cd frontend
npm install
npx playwright install chromium   # 測試在真瀏覽器裡跑，需要下載 Chromium（約 115 MB）

npm run dev        # 開發伺服器 http://localhost:5173
npm run typecheck  # vue-tsc --noEmit
npm run lint
npm run test       # Vitest browser mode
npm run build
```

後端另外啟動：

```bash
cd mock-backend && docker compose up
```

Docker 尚未整合，見「待辦」

---

## 技術選型

### 已安裝

| 套件 | 版本 | 用途 |
|---|---|---|
| `vue` | 3.5.43 | 框架（題目指定） |
| `vite` / `@vitejs/plugin-vue` | 8.3.0 / 6.0.9 | 建置 |
| `typescript` | **~6.0.3** | 題目指定，鎖 minor，原因見下 |
| `vue-tsc` | 3.3.11 | SFC 型別檢查，`tsc` 看不懂 `.vue` |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | 題目指定，v4 走 Vite plugin |
| `vitest` / `@vitest/browser` | 5.0.1 | 測試 |
| `@vitest/browser-playwright` / `playwright` | 5.0.1 / 1.63.0 | 瀏覽器 provider |
| `vitest-browser-vue` | 3.1.0 | 元件渲染，locator 內建重試 |
| `@vitest/coverage-v8` | 5.0.1 | 覆蓋率 |
| `eslint` / `eslint-plugin-vue` / `typescript-eslint` | 10.10.0 / 10.11.0 / 8.70.0 | 靜態檢查 |
| `prettier` / `prettier-plugin-tailwindcss` | 3.9.8 / 0.8.1 | 格式與 class 排序 |

執行期依賴只有 `vue` 一個

### 刻意不裝

| 套件 | 理由 |
|---|---|
| `pinia` | 整個流程是單一文件的單一狀態機，一支 composable 就涵蓋，多一層只是把 `ref` 換個地方放 |
| `vue-router` | 上傳→解析→審核是同一頁的三個狀態，不是三個網址；後端重啟後 `document_id` 即失效，做持久化也留不住 |
| `@vueuse/core` | 真正會用到的大概一兩個函式，自己寫十行更清楚 |
| UI 元件庫 | 題目要看的是資訊層級的判斷，元件庫的預設樣式會直接蓋掉這件事 |
| `zod` | 必填規則由後端 `required` 旗標決定且欄位是動態的，schema 反而繞路 |
| `msw` | 假後端改用 Vite middleware，行為更真且能驗證中止，原因見開發歷程 |
| `eventsource` | 測試改在真瀏覽器跑，原生就有 |
| `happy-dom` / `jsdom` | 同上，不再需要模擬 DOM |

`@tanstack/vue-virtual`（虛擬捲動）尚未決定，打算先用 `?field_count=300` 實測是否真的卡，再決定要不要為此犧牲瀏覽器原生的 Ctrl+F 搜尋

---

## 決策與開發歷程

> 本專案在 AI 協作下進行，此節逐次記錄每個階段的決策、當下的實測依據、以及過程中的判斷錯誤與修正，依時間順序由上而下累積
>
> 每則格式：**背景 → 實測 → 決策 → 修正**，凡是「實測」欄位裡的數字與輸出，都是當下真的跑出來的，不是推測

### 2026-09-18 — 依賴選型與專案骨架

#### 背景

倉庫只有題目說明與 mock 後端，前端從零開始，這一輪的任務是決定要裝哪些 NPM 套件，並把骨架立起來，不寫任何功能

#### 實測發現

**一、`typescript@latest` 現在會讓型別檢查整個失效**

npm 上的 `typescript` 最新版已是 7.0.2（原生 Go 版），但搭配 `vue-tsc@3.3.11` 會直接崩潰：

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]:
Package subpath './lib/tsc' is not defined by "exports" in typescript/package.json
```

TS 7 移除了 vue-tsc 依賴的 `lib/tsc` 進入點，而 vue-tsc 的 peer 範圍寫的是 `>=5.0.0`，不會擋你裝；降到 6.0.3 後正常運作，並正確抓出刻意寫錯的 SFC 型別（`TS2322`）

→ 所以 `package.json` 裡是 `"typescript": "~6.0.3"`，鎖 minor，不是 `^`

**二、SSE 在模擬 DOM 環境裡不存在**

| 環境 | `EventSource` |
|---|---|
| `happy-dom` 20.14.5 | ❌ |
| `jsdom` 30.1.0 | ❌ |
| Node 24.20.0 | ❌ |
| Node 24.20.0 + `--experimental-eventsource` | ✅ |
| 真瀏覽器 | ✅ |

這不是 happy-dom 特有的缺口 — 換 DOM 環境解決不了，而且範圍很窄：happy-dom 有 `fetch`、`ReadableStream`、`TextDecoder`、`MessageEvent`、`AbortController`、`WebSocket`、`ResizeObserver`，單缺 `EventSource`；它的 `fetch` 甚至是真串流（伺服器每 100ms 送一筆，chunk 分別在 9 / 117 / 226 / 335 / 443ms 抵達）

影響範圍不只是「測不到 SSE」 — 題目的九項資訊裡有七項的來源都在這條線上，一旦 `new EventSource()` 直接寫在元件裡，那個元件在測試環境會連 `mount()` 都丟例外 — 進度畫面、逐筆渲染、中止、錯誤、必填檢查、候選答案全部連帶測不到

**三、MSW 驗證不了「中止」這條需求**

用 MSW 起假後端、客戶端收第 3 筆後中止，handler 卻完全不知情：

```
>>> cancel 被呼叫: false / close 後伺服器仍送出到第 13 筆
```

更精確地說，`reader.read()` 在 abort 後不是丟 `AbortError`，而是正常 resolve `done=false`，所以 `for await` 迴圈永遠不會結束

後端 README 明寫「客戶端斷線時服務會停止運算」 — 這條契約在 MSW 底下驗不到，測試會在「其實沒真的斷掉」的情況下亮綠燈

**四、改用 Vitest browser mode 後，上面三件事一次解決**

把假後端改寫成 Vite middleware（真 HTTP、真連線、真斷線），測試跑在 headless Chromium 裡：

```
>>> EventSource: function EventSource() { [native code] }
>>> UA: HeadlessChrome/153.0.8010.12
>>> close 時已送 3 筆 → 500ms 後 3 筆 / 伺服器偵測到斷線: true
```

伺服器端真的收到 `req.on('close')` 並停止運算 — 這正是先前驗不到的那件事

附帶收穫是樣式可被測試釘住，`getComputedStyle` 拿得到真值：

```
>>> Tailwind text-red-600 計算後: oklch(0.577 0.245 27.325)
```

這讓「必填缺漏是紅色、低把握度是琥珀色」這種視覺層級變成可驗證的，而不只是看起來對

#### 決策

1. **測試跑在真瀏覽器（Vitest browser mode + Playwright Chromium）**，不用模擬 DOM
2. **假後端用 Vite middleware**，不用 MSW
3. **傳輸層仍會抽成可注入的介面**，理由與 EventSource 無關 — 而是元件不該知道資料從哪來
4. **執行期依賴只留 `vue`**
5. Docker 與虛擬捲動延後，各自有前置條件（前者需要先決定 compose 檔位置，後者需要先量測）

代價寫在這裡：Playwright 要下載 115 MB 的瀏覽器，但題目只要求「`docker compose up` 之後能直接開來用」，沒要求容器內能跑測試，所以打算把測試環境與交件驗收路徑切開

#### 過程中的判斷錯誤與修正

這節刻意保留，因為判斷錯誤本身也是歷程：

1. **一開始把 Vitest + happy-dom 當成既定前提在分析** — 但題目只說「測試至少一支」，沒有指定任何測試工具，那是我自己的選擇，卻沒有標示成選擇；後來才回頭確認題目原文
2. **把 MSW 的中止失效歸因給「MSW 搭配 EventSource polyfill」** — 重測後發現不是：改用純 `fetch` + `AbortController`、完全不碰 EventSource，結果一字不差；再換到 `environment: 'node'` 完全不碰 happy-dom，結果還是一字不差，**這是 MSW 本身的限制，與 happy-dom 無關，也與用不用 EventSource 無關**
3. **回報套件安裝成功時看錯了 exit code** — 當時讀的是 `tail` 的回傳碼而非 npm 的，導致第一次 devDependencies 整批沒裝進去卻回報成功，之後改用 `${PIPESTATUS[0]}` 取真正的回傳碼

#### 安裝過程踩到的坑

| 問題 | 症狀 | 處理 |
|---|---|---|
| `@eslint/js` 版本對不上 | ESLint 本體是 10.10.0，但 `@eslint/js` 最新只到 10.0.1，照 `^10.10.0` 寫會 `ETARGET` | 改成 `^10.0.1` |
| `baseUrl` 在 TS 6 被棄用 | `TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0` | 移除，`moduleResolution: "bundler"` 下 `paths` 不需要它 |
| Vitest 5 的 provider 不是字串 | 寫 `provider: 'playwright'` 會啟動失敗 | 從獨立套件 `@vitest/browser-playwright` 匯入函式 |
| `defineConfig` 來源錯誤 | 從 `vite` 匯入會報 `TS2769: 'test' does not exist` | 改從 `vitest/config` 匯入 |
| browser mode 首跑重載測試 | Vitest 警告會造成 flaky | 加 `optimizeDeps.include: ['vue', 'vitest-browser-vue']` |
| locator 匯入路徑 | 不是 `@vitest/browser/context` | 是 `vitest/browser` |
| browser mode 無自動 globals | 測試檔找不到 `it` | 明確 `import { it, expect } from 'vitest'` |

#### 產出與驗證

```
frontend/
├── package.json / vite.config.ts / tsconfig.json
├── eslint.config.js / .prettierrc.json / .gitignore
├── index.html
└── src/
    ├── main.ts / App.vue / style.css / env.d.ts
    └── setup.smoke.test.ts
```

| 指令 | 結果 |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 |
| `npm run build` | ✅ 60.45 kB，gzip 23.86 kB |
| `npm run test` | ✅ 2 passed（真 Chromium） |
| `npm run dev` | ✅ HTTP 200 |

`src/setup.smoke.test.ts` 只驗環境本身（EventSource 是否原生、SFC 掛不掛得起來、Tailwind 有沒有生效），不涉任何商業邏輯，用意是證明工具鏈確實能動，開始寫真正的測試後會移除 — 它不是題目要求的那「至少一支測試」

---

## 待辦

- [ ] SSE 傳輸層與可注入介面
- [ ] 上傳 / 解析中 / 審核三個階段的介面
- [ ] 防護性測試（中止、解析中途失敗、必填缺漏擋送出、候選答案挑選）
- [ ] `frontend/Dockerfile` 與 `docker-compose.yml` 整合
- [ ] 以 `?field_count=300` 量測後決定是否導入虛擬捲動
- [ ] 無障礙、跨裝置

### 題目指定的 README 項目（尚未撰寫）

- [ ] `AI產生的介面_參考.png` 最嚴重的三個問題，以及自己的版本怎麼處理
- [ ] 怎麼驗證這東西真的能動 — 實際試過哪些情況、怎麼試的、試出什麼問題
- [ ] 哪些是 AI 寫的、改了什麼、為什麼改
- [ ] 這份 code 裡最不確定的是哪一段
- [ ] 需求哪裡沒講清楚、如何假設
- [ ] 決定不顯示或降級顯示哪些資訊
- [ ] 哪兩條需求互相衝突、如何取捨
- [ ] 決定不做什麼
- [ ] 想問的三個問題
