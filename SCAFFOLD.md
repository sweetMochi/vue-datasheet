# 專案骨架與技術選型

裝了什麼、為什麼裝、為什麼不裝。設定檔放在哪、各自管什麼

| 文件                               | 回答什麼                                     |
| ---------------------------------- | -------------------------------------------- |
| [README.md](README.md)             | 這是什麼、怎麼跑、目前做到哪、介面長什麼樣   |
| SCAFFOLD.md（本文）                | 裝了什麼、為什麼、設定檔在哪                 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系統長什麼樣、每個檔案為什麼存在             |
| [REVIEW.md](REVIEW.md)             | 每個判斷的推導過程、實測數據、還沒把握的地方 |

題目指定要用的是 **TypeScript、Tailwind、Vue 或 React 擇一、至少一支測試、`docker compose up` 能直接開來用**。
其餘都是自己的選擇，所以每一項都要說得出理由

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

| 套件                  | 理由                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pinia`               | 整個流程是單一文件的單一狀態機，一支 composable 就涵蓋，多一層只是把 `ref` 換個地方放                                      |
| `vue-router`          | 上傳→解析→審核是同一頁的三個狀態，不是三個網址；後端重啟後 `document_id` 即失效，做持久化也留不住                          |
| `@vueuse/core`        | 真正會用到的大概一兩個函式，自己寫十行更清楚                                                                               |
| UI 元件庫             | 題目要看的是資訊層級的判斷，元件庫的預設樣式會直接蓋掉這件事                                                               |
| `zod`                 | 必填規則由後端 `required` 旗標決定且欄位是動態的，schema 反而繞路                                                          |
| `msw`                 | 假後端改用 Vite middleware，省一層依賴且樣式與互動可測（[比較](log/03-msw-中止驗證.md)）                                   |
| `eventsource`         | 傳輸層改用 `fetch` ＋ `ReadableStream`，SSE 分幀自己寫（[理由](ARCHITECTURE.md#srcapifetchstreamtransportts--預設傳輸層)） |
| `happy-dom` / `jsdom` | 同上，不再需要模擬 DOM                                                                                                     |

`@tanstack/vue-virtual`（虛擬捲動）**確定不裝**。實測 300 列在 4 倍 CPU 降速下按鍵 p95 只有 3.8ms、捲動不掉幀，
不值得為此犧牲瀏覽器原生的 Ctrl+F，也省下可變高度虛擬化的複雜度（[log/07](log/07-300欄位渲染量測.md)）

---

## 設定檔在哪

| 檔案                        | 管什麼                           | 備註                                             |
| --------------------------- | -------------------------------- | ------------------------------------------------ |
| `docker-compose.yml`        | `api` 與 `web` 兩個服務          | 放根目錄，理由見 [log/06](log/06-docker-整合.md) |
| `frontend/Dockerfile`       | 多階段 build → nginx             | `ARG VITE_API_BASE` 在 build 階段注入            |
| `frontend/.env`             | `VITE_API_BASE` 的預設值         | **build-time 靜態值**，不是執行期設定            |
| `frontend/vite.config.ts`   | 建置、alias、Vitest browser mode | `test.browser` 走 Playwright chromium            |
| `frontend/tsconfig.json`    | 型別檢查                         | `strict` ＋ `verbatimModuleSyntax`               |
| `frontend/eslint.config.js` | flat config                      | js ＋ typescript-eslint ＋ eslint-plugin-vue     |
| `frontend/.prettierrc.json` | 前端程式碼格式                   | 帶 `prettier-plugin-tailwindcss` 排序 class      |
| `.prettierrc.json`          | 根目錄 Markdown 格式             | 不帶 plugin，見下                                |
| `.editorconfig`             | 編碼、換行、縮排                 | 根目錄一份管全部，含 `mock-backend/` 的 Python   |
| `.gitignore`                | 忽略清單                         | 根目錄一份，`frontend/` 不另外放                 |

### 設計 token 走 Tailwind 的 `@theme`

顏色、字級這些 token 宣告在 `src/style.css` 的 `@theme` 區塊裡：

```css
@import 'tailwindcss';

@theme {
  --color-danger: #9e3226; /* 必填缺漏 */
  --color-caution: #8a5a00; /* 把握度低 */
  --color-choose: #35578a; /* 要你挑一個 */
}
```

**`@theme` 宣告的就是 CSS 自訂屬性**，沒有 JS 設定檔、沒有額外建置步驟。
它同時做兩件事：`var(--color-danger)` 可用，而且 `bg-danger` / `text-danger` 這些 utility 也可用

考慮過改在 `:root` 手寫變數、不走 `@theme`。不採用的理由是 Tailwind 不認得那些變數，
每個地方都要寫成 `text-[var(--ink)]` 這種 arbitrary value，等於題目指定的 Tailwind 只用了一半

**內建調色盤整個清掉**（`--color-*: initial`），只留下命名過的那十幾個：

這不是潔癖。整份設計的判斷是「顏色只給『要你動手』這一件事，其餘八成的列完全安靜」。
留著 `blue-500`、`green-400` 這些，遲早有人拿去標一個不需要使用者處理的東西，那個判斷就破功了。
要用別的顏色必須先在 `@theme` 裡命名，也就必須先說出它代表什麼狀態

有一支測試守著這件事：`bg-blue-500` 必須不產生任何規則

**字體用系統堆疊，不載 Google Fonts。** 設計稿是用 Noto Sans TC 畫的，但 CJK 字型檔
就算子集化也是好幾百 KB，為了一份「畫面不用做得漂亮」的作業付這個代價不划算，
而且會讓容器裡的頁面依賴外部網路。數字要對齊時用 Tailwind 內建的 `tabular-nums`，
那比換字型有效得多

### 為什麼有兩份 `.prettierrc.json`

`frontend/.prettierrc.json` 帶 `prettier-plugin-tailwindcss`（排序 class），根目錄那份沒有

根目錄那份是後來補的：沒有它的時候，根目錄的 Markdown 吃到的是 Prettier 預設值，
文件裡內嵌的 TypeScript 片段會被改成雙引號加分號 —— 跟專案實際的程式碼風格（`semi: false`、`singleQuote: true`）相反。
[REVIEW.md](REVIEW.md#沒把握的地方) 有一整節在談某四行程式碼，貼出來的樣子跟原始碼不一樣會很奇怪

---

## 五道檢查

交件前這五項都要綠：

```bash
cd frontend
npm run typecheck   # vue-tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest run，真瀏覽器
npm run build       # typecheck + vite build
npm run dev         # 起得來
```

再加上從 clone 出來的副本跑一次 `docker compose up --build`，理由見 [README 的快速開始](README.md#三交件前跑一次)
