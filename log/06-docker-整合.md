# 06 · Docker 整合

`2026-09-22` · 人工介入：選定方案（三個分歧點都由人工拍板）

## 起點

出題方的 `mock-backend/docker-compose.yml` 只留了一段註解：

```yaml
  # web:
  #   build: ./frontend
  #   ports:
  #     - "5173:5173"
```

這段解不開 —— `build` 的 context 相對於 compose 檔所在目錄，`./frontend` 從 `mock-backend/` 解析會變成 `mock-backend/frontend`，那個目錄不存在

所以要先決定三件事

## 一、compose 檔擺哪裡

| 選項 | 代價 |
| --- | --- |
| 留在 `mock-backend/`，前端寫 `context: ../frontend` | build context 跳出目錄，compose 檔與它管的其中一個服務不同層 |
| 把 `frontend/` 搬進去、資料夾改名 `project/` | 後端的 `build: .` 會吃到 179 MB 的 `node_modules`（要另寫 `.dockerignore` 補救）；而且弄丟「哪些是出題方給的」這條界線 |
| **移到 repo 根目錄** ✅ | 動到出題方原本的檔案位置，需要在 README 交代 |

選根目錄。兩個 build context 各自指向自己的目錄都是乾淨的，`docker compose up` 的位置就是 clone 進去的第一層 —— 這也是多數人的預設習慣。`mock-backend/` 的內容一個字都沒動，界線還在

## 二、容器裡跑 dev server 還是 build 產物

註解的 `5173:5173` 是 Vite dev server 的形狀（production 產物不會落在這個數字上：nginx 是 80、`vite preview` 是 4173）

但出題方自己的後端不是 dev 形狀：`mock-backend/Dockerfile` 的 CMD 是 `uvicorn server:app --host 0.0.0.0 --port 8000`，**沒有 `--reload`**，而 README 裡不用 Docker 的跑法才寫 `--reload`。同一份材料裡容器版是成品、本機版才是開發模式 —— 這個對比是刻意分開的

而且照註解字面做出來的東西兩頭落空：不掛 volume 就沒有熱更新，serve 的又不是 `npm run build` 的產物，`vue-tsc` 那道關卡也沒跑到。評審打開的東西和交付的東西有落差

選 production build，多階段 → nginx

## 三、要不要反代 /api

| | A 反代（同源） | B 直連（跨源） |
| --- | --- | --- |
| build arg | `VITE_API_BASE: ""` | `VITE_API_BASE: http://localhost:8000` |
| `nginx.conf` | 要寫，且 **`proxy_buffering off` 不能漏**，否則 SSE 會被攢起來一次吐完 | 不需要 |
| `src/api/http.ts` | 要改 `new URL(BASE + path, location.origin)`，空 BASE 會丟 `TypeError` | 不動 |
| `vite.config.ts` | 要加 `server.proxy` 讓 dev 對齊 | 不動 |
| 測試 | 要補一支釘住空 BASE | 現有 45 支不動 |
| 啟動順序 | 要 `healthcheck`，nginx 解析不到 upstream 會直接退出 | `depends_on` 就夠 |
| 換 port／跨裝置 | 不必重 build | 要重 build |

選 B

AI 一開始推薦 A，理由是「production 形狀正統、換 port 不必重 build」—— 純技術角度成立。改推 B 的理由是把專案狀態算進來：**上傳／解析中／審核三個介面全部還沒開始**，而題目寫的是「比起功能做得多完整，我們更想看 README 跟測試」。A 要動四個檔案、多一份 conf、多一個啟動順序問題，全部花在不是這題重點的地方，動到的還是已經有測試覆蓋、已經寫進文件的那一層

另一個支持 B 的論據：`mock-backend/README.md` 明寫「已開放 CORS」。那是出題方刻意的設計，他們預期前端跨源直連

A 的優點不會消失，介面做完後有餘裕再換也來得及

## 埠為什麼是 8080

`5173` 在前端圈的語意就是 Vite dev server。讓 production 產物佔走它有兩個問題：語意誤導，以及日常開發 `docker compose up` 之後再跑 `npm run dev` 會撞埠 —— Vite 會默默改用 5174，而你以為自己在看 dev server、其實開的是容器裡的舊產物

刻意偏離註解建議的數字，README 有交代

## 還沒驗證的部分

寫這份時本機 Docker Desktop 的 daemon 沒在跑（`npipe://...dockerDesktopLinuxEngine` 連不上），**三套指令一次都還沒實跑**

待驗清單：

- SSE 是不是逐筆抵達，不是最後一次吐完
- 上傳 `檢驗報告_範例.pdf` 會不會被擋
- api 還在啟動時開頁面的行為
- `git clone` 到另一個目錄再 `up --build`，確認 build context 裡沒有漏提交的檔案

## 已經驗過的一項

`ARG` 傳進去的值 Vite 到底吃不吃 —— 這是寫這份時最沒把握的地方，但它不需要 Docker 就能驗，因為 `ARG` 就是以環境變數的形式交給 `RUN`：

```bash
VITE_API_BASE=http://verify.test:9999 npm run build
grep -ro "verify\.test:9999" dist/assets/   # 命中
grep -ro "localhost:8000" dist/assets/      # 無殘留
```

`process.env` 的值確實覆蓋掉 `.env` 的預設值，並被字面替換進 bundle。原本準備的退路（build 階段先寫一份 `.env.production`）用不上
