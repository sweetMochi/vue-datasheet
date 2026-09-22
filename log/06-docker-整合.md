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

## 實跑結果

`2026-09-22`，Docker Desktop 起來之後跑過一輪

| 驗什麼 | 結果 |
| --- | --- |
| 冷啟 build ＋ 啟動 | 20 秒，兩個容器都 Up |
| 映像大小 | web 93.7 MB（nginx ＋ dist）、api 245 MB |
| build arg 有沒有進 bundle | 有，容器內的 `/assets/index-*.js` 抓得到 `http://localhost:8000` |
| 上傳 `檢驗報告_範例.pdf`（312 KB） | 200，拿得到 `document_id` |
| SSE 逐筆抵達 | 是。stage 五筆分散在 0～5 秒，field 六筆分散在 5～7 秒，不是最後一次吐完 |
| `fail_at=3` | 三筆 field 之後收到 `error` / `UPSTREAM_TIMEOUT` |
| `field_count=300&speed=10` | 12 秒，300 筆 field 全到，`done` 的 `field_count` 對得上 |
| 中途斷線（`timeout 5 curl`） | 50 筆收到 44 筆後斷線，api 服務本身不受影響 |
| 乾淨 clone 再 build | 成功，且 bundle 檔名雜湊與主專案相同（`index-CT9yBHj1.js`） |

`ARG` → Vite 那條路也確認了 —— 這是寫這份時最沒把握的地方，而它不需要 Docker 就能驗，因為 `ARG` 就是以環境變數的形式交給 `RUN`：

```bash
VITE_API_BASE=http://verify.test:9999 npm run build
grep -ro "verify\.test:9999" dist/assets/   # 命中
grep -ro "localhost:8000" dist/assets/      # 無殘留
```

`process.env` 的值確實覆蓋掉 `.env` 的預設值並被字面替換進 bundle。原本準備的退路（build 階段先寫一份 `.env.production`）用不上

## 順手撞到的問題：中文檔名會亂碼

上傳 `檢驗報告_範例.pdf`，後端回傳的 `filename` 是 `ÀËÅç³ø§i_½d¨Ò.pdf`；同一個檔案改成純 ASCII 檔名就正常

`server.py` 第 226 行只是原封不動回傳 `file.filename`，所以是 multipart 解析層把 UTF-8 的位元組當 latin-1 解掉了。後端不改，也沒必要為此改

**對前端的影響**：畫面上要顯示檔名時用本地的 `File.name`，不要用 API 回傳的 `filename`。使用者上傳中文檔名的機率不低，顯示成亂碼會讓人以為檔案傳壞了

這一項是用 curl 驗的。瀏覽器送 multipart 時同樣是 UTF-8 位元組，推測結果一樣，但**沒有實測過瀏覽器**

## 還沒驗的

- api 還在啟動時開頁面的實際表現 —— 靜態檔本身不依賴 api（web 容器單獨起得來），但前端此時的錯誤處理長什麼樣，要等介面做完才看得出來
- 跨裝置與其他瀏覽器
