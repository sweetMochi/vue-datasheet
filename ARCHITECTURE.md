# 應用程式結構

這份文件說明 `frontend/` 的檔案配置、資料流向，以及每一塊存在的理由

建議的閱讀順序：先看「狀態機」知道整個流程長什麼樣，再看「資料流」知道誰寫誰讀，最後才看個別檔案

推導過程、實測數據與還沒把握的地方另外放在 [REVIEW.md](REVIEW.md) —— 這裡講「系統長什麼樣」，那裡講「為什麼這樣決定、怎麼確認它是對的」

---

## 目前的實作範圍

| 層                                      | 狀態                                                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 型別（`src/types/`）                    | ✅ 已建立                                                                                                                                                                   |
| 傳輸層（`src/api/`）                    | ✅ 已建立，`fetch` ＋ `ReadableStream`                                                                                                                                      |
| 狀態與 composable（`src/composables/`） | ✅ 已建立                                                                                                                                                                   |
| 測試                                    | ✅ 120 支，涵蓋 SSE 分幀、HTTP 狀態分流、分組順序、送出阻擋、中止、中途失敗、重設、重新解析的資料保護、送出、樣式設定、一列的五種狀態、篩選與導覽、送出流程、中止確認與上傳 |
| 元件（`src/components/`）               | ✅ 全部建好                                                                                                                                                                 |
| 容器化                                  | ✅ 已建立並實跑驗證（[log/06](log/06-docker-整合.md)）                                                                                                                      |
| 切版示意                                | ✅ 四張設計稿，見 [README 的介面設計](README.md#介面設計) 與 `log/design/`                                                                                                  |

`src/App.vue` 依 `phase` 分成兩段：`idle` 是上傳，其餘都走 `ReviewLayout`。
審核畫面已經切版完成 —— 三區骨架、群組導覽、分段與搜尋、sticky 區段標題、
一列的五種狀態、編輯／確認／挑候選／重設都能用

送出也接上了：確認對話框 → `console.table(payload)` → 完成對話框 → 回到 `idle` 等下一份

上傳與例外狀態也切好了：拖放上傳、中止確認、解析中斷的說明帶。
`ParseProgressBar` 沒有獨立成元件 —— 它是 `ReviewLayout` 的一個 slot 加一行寬度綁定，
抽出來只會多一層間接

`src/style.css` 的 `@theme` 設計 token 見
[SCAFFOLD.md](SCAFFOLD.md#設計-token-走-tailwind-的-theme)

---

## 狀態機

整個 app 是單一文件的單一流程，畫面切換全部由 `phase` 決定

```
idle ──start()──▶ uploading ──上傳成功──▶ parsing ──done──▶ review ──送出──▶ submitted
                     │                      │
                     └──上傳失敗───────┐     ├── error 事件 ──▶ failed
                                      └─────┴── abort()     ──▶ aborted
```

三個判斷寫在這裡，因為它們決定了後面所有的結構：

**一、`parsing` 與 `review` 不是兩個畫面**

SSE 一送來 `field` 事件就進清單，使用者可以立刻開始審。若做成「解析中畫面 → 轉場 → 審核畫面」，就等於讓使用者盯著空白畫面數十秒，直接違反題目第一條需求

**二、`failed` 與 `aborted` 都不是死路**

兩者都保留已經抽到的欄位，差別只在原因與可用的動作。`failed` 提供「重新解析」，`aborted` 提供「繼續等」的反悔路徑。清空欄位回到 `idle` 會讓使用者前面等的幾十秒全部作廢

**三、重新解析不重新上傳**

`document_id` 還在，重傳檔案只是讓使用者多等一次。所以 `uploadDocument` 與 extract 是兩支獨立的函式，而不是一支 `uploadAndExtract`

---

## 中止與重新解析的契約

題目列的需求之一是「跑到一半使用者可能就不想等了」。這一節只講契約，推導過程與實測見
[REVIEW.md](REVIEW.md#使用者中止的完整流程)

### 中止會真的讓後端停

`abort()` → `controller.abort()` → 瀏覽器斷線 → 後端 `request.is_disconnected()` → `return`

前端是立即的：`settled = true` 之後不再派送任何事件，而且 `AbortError` 被吃掉，
**不會冒出 `CONNECTION_LOST`** —— 中止是使用者的意圖，不是錯誤

後端在下一次迴圈頂端停止（最長約 0.6 秒），檢查點在 `yield` 之前，所以延遲期間不會再吐出任何欄位

### 中止與失敗的差別

|               | `aborted`    | `failed`                          |
| ------------- | ------------ | --------------------------------- |
| 觸發          | 使用者按中止 | `error` 事件、HTTP 失敗、串流截斷 |
| 已抽欄位      | 保留         | 保留                              |
| `streamError` | `null`       | 有值                              |
| `canRetry`    | `true`       | `DOCUMENT_EXPIRED` 時為 `false`   |
| 畫面          | 「繼續解析」 | 「重新解析」或「重新上傳」        |

兩者都保留欄位，所以 `canRetry` 的判斷涵蓋 `aborted` 與 `failed` 兩種 phase

### 重新解析一律丟棄使用者的修改

後端的 `id` 是洗牌後的位置序號，跨解析不穩定（實測兩次解析 18 個欄位，label 對得起來的是 0 個），
沒辦法把舊修改對回新結果。所以 `retry()` 回傳三態而不是 `boolean`：

```ts
type RetryOutcome = 'started' | 'needs-confirm' | 'unavailable'
```

| 情況                 | 回傳            | 畫面                        |
| -------------------- | --------------- | --------------------------- |
| 沒有任何修改         | `started`       | 直接重跑，不多問一句        |
| 有修改或確認過       | `needs-confirm` | 「會丟掉你改過的 N 個欄位」 |
| `document_id` 已失效 | `unavailable`   | 引導重新上傳                |

`applyField` 裡的 `if (!drafts.has(...))` 只防同一條串流內的重送，**不是**跨解析的合併機制，
該處有註解鎖住這件事

---

## 送出的契約

資料送出給後端的規格不明確（mock 後端只有上傳、解析、健康檢查三支），所以送出
**不對規格做任何假設，也不打任何 API**。選定理由與被否決的兩個方案見
[log/08](log/08-資料送出規格不明確.md)

| 步驟   | 行為                                                                       |
| ------ | -------------------------------------------------------------------------- |
| 按送出 | 不灰掉。`canSubmit` 為假時把使用者帶到第一個缺漏欄位，為真時開確認對話框   |
| 確認   | `markSubmitted()` 只推進 `phase`，欄位與草稿都不動                         |
| 輸出   | `console.table(submitPayload)` —— 後端沒有接收端點，這是這份資料唯一的出口 |
| 完成   | 對話框標題「送出完成」，內文寫明資料去了 console                           |
| 關閉   | `reset()` 回到 `idle`，清空欄位、草稿、`document` 與已選檔案，等下一份     |

`submitted` 是個過場狀態，停留的時間就是使用者看完成對話框的那幾秒。
審核員的動線是一份接一份，停在終點畫面等於每份都要多按一次「重來」

---

## 資料流

```mermaid
flowchart LR
    subgraph api["src/api"]
        UP["uploadDocument<br/>POST /api/documents"]
        FS["fetchStreamTransport<br/>GET .../extract"]
        SP["sseParser<br/>SSE 分幀"]
        PF["parseFieldEvent<br/>防禦式解析"]
    end

    subgraph comp["src/composables"]
        EX["useExtraction<br/>串流生命週期"]
        ST["useReviewStore<br/>唯一狀態來源"]
        FL["useFieldFilters<br/>群組／分段／搜尋"]
    end

    subgraph ui["src/components（未建立）"]
        V["元件"]
    end

    FS --> SP
    SP --> PF
    PF --> EX
    UP --> EX
    EX -->|"applyStage / applyField<br/>applyError / applyDone"| ST
    ST --> FL
    ST --> V
    FL --> V
    V -->|"start / abort / retry"| EX
    V -->|"setValue / confirm<br/>chooseCandidate / resetField"| ST
```

元件永遠不直接碰 `fetch`，也不直接碰串流。傳輸層是一個可注入的介面（`ExtractionTransport`），測試塞假的進去就能推事件，不需要真的後端，也不需要等真的時間

這個介面先後被 `EventSource` 與 `fetchStreamTransport` 兩種實作填過（見決策 08），換掉傳輸方式時 store、composable、既有測試一行都不用改

---

## 檔案配置

### `src/types/field.ts` — 領域型別與唯一的狀態判準

| 匯出                       | 目的                                            |
| -------------------------- | ----------------------------------------------- |
| `ExtractedField`           | 後端說的事實，收到之後永遠不再變動              |
| `FieldDraft`               | 使用者的意圖：`value` / `confirmed` / `touched` |
| `FieldStatus`              | 一列的五種狀態，決定色條顏色                    |
| `resolveStatus()`          | **全專案唯一的狀態判準**                        |
| `LOW_CONFIDENCE_THRESHOLD` | 低把握度的界線，0.7                             |
| `groupOrder()`             | 群組顯示順序，未知群組排在已知的四個之後        |

**為什麼 `ExtractedField` 與 `FieldDraft` 要分開**

合成同一個物件的話，「重設」無法實作 —— 原值已經被蓋掉了。而且分不出「使用者主動確認過」與「系統把握度高所以不用管」，這兩件事在需求裡是不同語意

**為什麼狀態判準只能有一份**

色條、待處理計數、群組角標、篩選條件全部從 `resolveStatus()` 衍生。散到各元件裡就會出現「側欄說 5 個、清單只有 4 條有色」這種對不起來的情況。閾值要調也只改一個地方

**判斷優先序**：`missing` ＞（已確認就是 `ok`）＞ `unconfirmed` ＞ `multiCandidate` ＞ `lowConfidence` ＞ `ok`

只有「確認」會讓一列變成 `ok`，改值不會，而且改值會清掉確認。`unconfirmed` 是後端沒抽到、使用者補上但還沒確認的必填欄位，
跟 `lowConfidence` 同色、不同標註 —— 系統對它談不上把握。理由見 [REVIEW.md](REVIEW.md#二只有確認才算處理完)

多候選排在低把握之前，是因為候選是「要你挑一個」，動作比「去看一眼」明確。後端給多候選時一定同時給低把握度，兩者永遠同時成立

**`0.7` 這個數字的來源**：mock 後端的 `confidence` 是雙峰分布，0.7 正好落在兩峰之間的真空段，所以在這份 mock 上怎麼調都不影響分類。這也表示它從來沒被驗證過 —— 24000 筆實測、風險與替代方案見 [REVIEW.md](REVIEW.md#低把握度界線-07-的推導)

**非必填又沒抽到的欄位不標色**：使用者無從得知文件裡到底有沒有這個值，標了只是製造一堆他沒辦法處理的紅點

---

### `src/types/extraction.ts` — 流程型別與傳輸層介面

定義四種 SSE 事件（`stage` / `field` / `error` / `done`）、`ReviewPhase`、`ExtractOptions`，以及最重要的 `ExtractionTransport`

```ts
type ExtractionTransport = (
  documentId: string,
  options: ExtractOptions,
  handlers: ExtractionHandlers,
) => ExtractionSubscription
```

**拿掉會怎樣**：測試就得起一個真的後端，或是去 mock 全域的 `fetch`。前者讓測試變慢又不穩，後者等於在測 mock 而不是測自己的程式

`ExtractOptions` 對應後端的三個 query 參數（`field_count` / `speed` / `fail_at`），手動驗證 300 欄位、五倍速、中途失敗都靠它

---

### `src/api/http.ts` — 位址與錯誤型別

後端位址走 `VITE_API_BASE` 環境變數而不是寫死，預設值放在 `frontend/.env`，個人覆寫放 `.env.local`（已被 `.gitignore` 排除）

**它是 build-time 的靜態值**，不是執行期才讀的設定 —— Vite 打包時把它字面替換進 bundle（`npm run build` 後 `dist/assets/*.js` 裡只剩 `http://localhost:8000`，找不到 `VITE_API_BASE` 這個名字）。所以程式碼裡不做 `??` 後備、也不正規化結尾斜線：值一定存在，長什麼樣子在 `.env` 就看得到

這也代表 **Docker 整合時不能用 compose 的 `environment:` 注入**，那對已經打包好的靜態檔沒有作用，得在 build 那一步就給 —— 已落實成 `docker-compose.yml` 的 `build.args` 與 `frontend/Dockerfile` 的 `ARG VITE_API_BASE`

**它必須填瀏覽器連得到的位址，不能填 compose 的服務名**（`http://api:8000`）。發出這些請求的是使用者的瀏覽器，它跑在主機上、不在 compose 網路裡，解析不到 `api` 這個名字。所以前端就算也進了 compose，這個值仍然是 `http://localhost:8000`。要讓前端改用服務名，得由**容器裡的那一層**反代 `/api`（跑 nginx 就是 nginx，容器內若跑的是 Vite 才輪到 Vite proxy），而不是改這個值 —— 本專案選擇不反代，取捨見 [log/06](log/06-docker-整合.md)

真正會需要換掉它的是這三種情況：8000 被別的東西佔走而改了 `docker-compose.yml` 的 `ports`、從區域網路上的另一台裝置連 `vite --host` 開出來的頁面（此時 `localhost` 指的是那台裝置自己）、以及部署到 localhost 以外的位址

`ApiError` 帶 `status`，讓呼叫端能分辨「HTTP 層失敗」與「串流中途失敗」—— 這兩件事在畫面上的文案與可用動作都不同

---

### `src/api/uploadDocument.ts` — 只做上傳

刻意不順便開始解析，理由見上面狀態機的第三點

`AbortError` 直接往外丟不包裝，讓呼叫端能分辨「使用者取消」與「真的失敗」

**回傳的 `filename` 用本地的 `File.name`，不是 API 回傳的值**。後端那個只是把我們剛送上去的
檔名原封不動回傳，是一趟編碼往返之後的回音；同一份資訊本地就有，少繞一圈

---

### `src/api/parseFieldEvent.ts` — 防禦式解析

題目寫明「後端偶爾會出包」。這裡不信任任何一個欄位：型別不對就補安全預設值，而不是讓整條串流炸掉。少一個 `page` 顯示成 P0，總比整份解析結果消失好

只有連 `id` 都沒有時才回傳 `null` 丟掉該筆

順便正規化：只有一個候選答案等於沒有候選答案，在這裡就拿掉，免得每個消費端各自判斷 `length > 1`

---

### `src/api/sseParser.ts` — SSE 分幀

改用 `fetch` ＋ `ReadableStream` 之後，原本由瀏覽器代勞的 SSE 分幀變成自己的責任。這支是純函式（push 進字串、吐出事件），所以可以直接餵它被切爛的 chunk 序列來測

只實作本專案用得到的子集：`event:`、`data:`、註解行。後端的 `_sse()` 不送 `id:` 也不送 `retry:`

**最容易錯的一條**：`\r\n` 被 chunk 切在 `\r` 與 `\n` 之間時，不能提早把 `\r` 正規化成 `\n`——否則下一個 chunk 開頭的 `\n` 會跟它湊成 `\n\n`，把一個事件從中間劈成兩半。所以結尾的 `\r` 要留在 buffer 裡等下一段

**`flush()` 的用途**：串流可能在沒有尾隨空行的情況下結束（後端被 kill），最後一個事件要補送出去

---

### `src/api/fetchStreamTransport.ts` — 預設傳輸層

**為什麼不用 `EventSource`：讀不到 HTTP 狀態碼**

後端 README 寫明「服務重啟後已上傳的 `document_id` 會失效」，此時 extract 端點回 404（[server.py:246](mock-backend/server.py#L246)）

`EventSource` 遇到非 200 只會觸發一個**不帶狀態碼也不帶內文**的 error 事件，前端無從分辨「後端整個掛了」與「這份文件已失效」。結果是畫面給出「重新解析」，使用者按下去又 404，被鎖在一個按不出去的錯誤畫面裡

換成 `fetch` 之後可以照狀態碼分流：

| 狀態                    | 錯誤碼             | 畫面該給什麼                           |
| ----------------------- | ------------------ | -------------------------------------- |
| 404                     | `DOCUMENT_EXPIRED` | 重新上傳（`canRetry` 為 false）        |
| 400                     | `BAD_REQUEST`      | 沿用後端 `detail` 原文，開發期參數錯誤 |
| 其他                    | `HTTP_ERROR`       | 重新解析                               |
| fetch 直接拋錯          | `CONNECTION_LOST`  | 確認後端是否啟動                       |
| 串流結束但沒收到 `done` | `STREAM_TRUNCATED` | 結果不完整，可重新解析                 |

404 刻意**不用**後端的 `detail`（「找不到這份文件」）：那句話沒有告訴使用者該做什麼

**附帶好處：不必再跟自動重連角力**

`EventSource` 在串流被伺服器正常關閉後會自己重連，原本得靠 `close()` ＋ `settled` 旗標在三條路徑上壓住它。而且後端從不送 `id:`，就算重連也無法續傳，只會整份重跑一次——這個「功能」在本專案是純粹的危害

**失去了什麼**：自動重連與 `Last-Event-ID` 續傳。如上，後端本來就不支援續傳，所以代價是零。哪天後端加上 `id:` 與續傳，這個判斷要重新評估

---

### `src/composables/useReviewStore.ts` — 唯一狀態來源

不用 Pinia：整個流程是單一文件的單一狀態機，一支 composable 就涵蓋（理由見 [SCAFFOLD.md 的「刻意不裝」](SCAFFOLD.md#刻意不裝)）

匯出 `createReviewStore()` 工廠與 `useReviewStore()` 單例。**測試一律用工廠自己開一份乾淨的**，不碰單例

#### 原始狀態

|               | 型別                           | 誰寫                   |
| ------------- | ------------------------------ | ---------------------- |
| `phase`       | `ReviewPhase`                  | 流程事件               |
| `document`    | `UploadedDocument \| null`     | 上傳成功               |
| `progress`    | `ExtractionProgress`           | `stage` 事件           |
| `streamError` | `ExtractionErrorEvent \| null` | `error` 事件           |
| `fields`      | `Map<id, ExtractedField>`      | **只有 SSE**           |
| `drafts`      | `Map<id, FieldDraft>`          | **只有使用者**         |
| `order`       | `string[]`                     | `field` 事件的到達順序 |

兩個 Map 都用 `shallowReactive`，而且草稿永遠整個物件替換不就地修改。理由是 `ExtractedField` 本來就不可變，沒必要為 300 個物件各建一層深層 proxy

`order` 單獨存在的理由：後端是照文件裡出現的順序送的，**這個順序本身就是資訊**（對應使用者翻文件的動線），不能靠 `Map` 的插入順序含糊帶過，也不能改成依 `id` 排序

#### 衍生資料

| getter                        | 目的                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `byGroup`                     | 群組 → 欄位 id，群組照 `KNOWN_GROUPS` 排、組內維持文件順序 |
| `statusOf(id)`                | 單列狀態                                                   |
| `pendingIds` / `pendingCount` | 需要處理的欄位                                             |
| `groupCounts`                 | 每組的待處理數與總數，給左欄導覽                           |
| `blockingIssues`              | 擋住送出的欄位清單                                         |
| `canSubmit`                   | `blockingIssues` 為空且已有欄位                            |
| `submitPayload`               | 使用者確認後的值，附 `edited` 旗標                         |
| `isStreaming`                 | 是否顯示骨架列與中止鈕                                     |
| `canRetry`                    | 能不能重跑同一份文件（`DOCUMENT_EXPIRED` 時為 false）      |
| `editedIds` / `hasUserEdits`  | 使用者改過或確認過的欄位，重新解析前用它決定要不要先問     |

**`blockingIssues` 刻意不是「已確認數 === 總數」**

使用者沒有義務逐一確認 108 個高把握度欄位，法規在意的只有三個必填欄位。把送出條件寫成全部確認，等於把「審核」變成「按 120 次確認」

---

### `src/composables/useExtraction.ts` — 串流生命週期擁有者

元件只呼叫 `start` / `abort` / `retry`，不碰 `fetch`，也不碰 subscription

`retry()` 回傳 `RetryOutcome` 三態（`started` / `needs-confirm` / `unavailable`）而不是 `boolean`：
`document_id` 已失效與「使用者有未保存的修改」要走完全不同的路，合成一個 `false` 會把兩者混在一起。
完整規則見[重新解析一律丟棄使用者的修改](#重新解析一律丟棄使用者的修改)，推導見 [REVIEW.md](REVIEW.md#重新解析會丟掉什麼)

**為什麼訂閱握在這裡而不是元件裡**：header 元件被卸載時 subscription 會跟著洩漏，後端要等到 TCP 超時才知道沒人在聽了。`onScopeDispose` 保證任何卸載路徑都會斷線

**中止的實質意義**：`close()` 讓瀏覽器斷線，後端的 `request.is_disconnected()` 隨即為真並停止運算。中止不只是前端不看了，是真的讓後端別算了

`uploadError` 與 `store.streamError` 分開放，因為「連不上後端」與「解析跑到一半掛掉」在畫面上是不同的文案與不同的可用動作

---

### `src/composables/useFieldFilters.ts` — 篩選

群組、分段（只看要處理的／全部）、關鍵字三個條件組合出 `sections`，直接是分組後的結構，元件不必再 groupBy 一次

搜尋涵蓋「標籤」與「使用者現在看到的值」，不是後端原本抽到的值 —— 使用者改過之後再搜尋，找的當然是他改成的內容

空群組不出現在清單裡，否則「只看要處理的」會留下一排空標題

`isEmptyResult` 區分「篩選後沒結果」與「還沒有資料」，兩者文案不同

---

## Store 依賴關係

```mermaid
flowchart TD
    subgraph src["外部輸入"]
        SSE["SSE 事件<br/>stage / field / error / done"]
        USER["使用者操作<br/>編輯 · 確認 · 挑候選 · 重設"]
    end

    subgraph raw["原始狀態"]
        PHASE["phase"]
        DOC["document"]
        PROG["progress"]
        FIELDS["fields<br/>後端事實 · 唯讀"]
        ORDER["order<br/>文件順序"]
        DRAFTS["drafts<br/>使用者意圖"]
        ERR["streamError"]
    end

    subgraph idx["索引"]
        BYGROUP["byGroup"]
        STATUS["statusOf(id)"]
    end

    subgraph derived["衍生"]
        PENDING["pendingIds"]
        COUNTS["groupCounts"]
        PENDCNT["pendingCount"]
        BLOCK["blockingIssues"]
        CANSUB["canSubmit"]
        PAYLOAD["submitPayload"]
    end

    subgraph ui["元件消費端"]
        NAV["GroupNav"]
        TRIAGE["TriageBar"]
        SECT["FieldGroupSection"]
        ROW["FieldRow"]
        GUARD["SubmitGuard"]
        PBAR["ParseProgressBar"]
        EBAN["ParseErrorBanner"]
    end

    SSE -->|stage| PROG
    SSE -->|field| FIELDS
    SSE -->|field| ORDER
    SSE -->|field| DRAFTS
    SSE -->|error| ERR
    SSE -->|error| PHASE
    SSE -->|done| PHASE
    USER --> DRAFTS

    FIELDS --> BYGROUP
    ORDER --> BYGROUP
    FIELDS --> STATUS
    DRAFTS --> STATUS

    STATUS --> PENDING
    BYGROUP --> COUNTS
    STATUS --> COUNTS
    PENDING --> PENDCNT

    FIELDS --> BLOCK
    DRAFTS --> BLOCK
    BLOCK --> CANSUB
    FIELDS --> PAYLOAD
    DRAFTS --> PAYLOAD

    COUNTS --> NAV
    PENDCNT --> NAV
    PENDCNT --> TRIAGE
    BYGROUP --> SECT
    STATUS --> ROW
    FIELDS --> ROW
    DRAFTS --> ROW
    BLOCK --> GUARD
    CANSUB --> GUARD
    PROG --> PBAR
    ERR --> EBAN
    PHASE --> PBAR
    PHASE --> EBAN
```

### 這張圖要守住的三條規則

**一、箭頭只有一個方向**

`fields` 從不被使用者操作改動，`drafts` 從不被 SSE 改動（除了首次收到欄位時初始化）。「重設」＝ 從 `fields` 讀值寫回 `drafts`，不是雙向綁定

**二、`statusOf` 是唯一的狀態判準**

色條、待處理計數、篩選、群組角標全部從它衍生

**三、`FieldRow` 只吃 props，不連進 store**

圖上通往 `FieldRow` 的三條線是由 `FieldGroupSection` 取好再往下傳的，不是 300 個 row 各自訂閱 store

---

## 元件配置

`review/` 全部建好了，`upload/` 與 `parse/` 仍是規劃：

```
src/components/
  ui/
    ModalDialog.vue           ✅ 原生 <dialog>，焦點鎖定與 Esc 都免費
  upload/
    FileDropZone.vue          ✅ label 包真的 input，拖放與鍵盤都能用
  parse/
    ParseErrorBanner.vue      ✅ 依 canRetry 決定給「重新解析」還是「重新上傳」
    AbortConfirmDialog.vue    ✅ 欄位數是活的，不是快照
  review/
    ReviewLayout.vue          ✅ 純排版，三區骨架
    GroupNav.vue              ✅
    TriageBar.vue             ✅
    FieldGroupSection.vue     ✅
    fieldStatusView.ts        ✅ 狀態 → 色條／標註／說明，只有一份
    FieldRow.vue              ✅
    FieldValueEditor.vue      ✅
    CandidatePicker.vue       ✅
    ConfidenceMark.vue        ✅
    SubmitGuard.vue           ✅ 擋住送出的說明帶
```

### 已建好的四個

`fieldStatusView.ts` 是狀態的**畫面表現**只有一份的地方 —— `resolveStatus()` 決定一列是什麼
狀態，它決定那個狀態長什麼樣子。散到各元件裡就會出現「色條是紅的、旁邊卻寫把握度低」

`FieldValueEditor` **永遠渲染一個真的 `<input>`**，安靜的列只是把外框與底色拿掉。
考慮過「純文字、點一下才變輸入框」，沒採用：那種做法鍵盤到不了，Tab 會跳過八成的欄位。
外觀一樣，但一個能用鍵盤審完整份文件、一個不能。附帶好處是元件不需要自己的 editing 狀態

`CandidatePicker` 的「都不對，自己填」透過 `defineExpose({ focus })` 把游標送進輸入框。
沒有這顆，使用者會以為只能從系統給的三個裡面挑

`AbortConfirmDialog` 的欄位數**必須綁 `store.order.length`，不能是開啟時的快照**。
`abort()` 是按下「停止」才呼叫的，對話框開著的那幾秒串流仍在跑 ——
實測開啟時 13、兩秒半後 28。寫死快照會讓那句話變成謊言

`ParseErrorBanner` 依 `canRetry` 決定給哪顆按鈕：`DOCUMENT_EXPIRED` 時重跑一百次都是 404，
該給的是「重新上傳」。這個分辨能力正是傳輸層從 `EventSource` 換成 `fetch` 換到的

`FileDropZone` 外層是 `<label>` 包一個真的 `<input type="file">`（`sr-only` 而非 `hidden`）。
點整塊開檔案選擇器、Tab 進得來、拖放也可以 —— 用 div 做的話鍵盤使用者沒有路可走

`ConfidenceMark` 是 `aria-hidden` 的 —— 同一件事右邊的文字標註已經說過，讀螢幕器再念一次是噪音

`ReviewLayout` 只有排版沒有狀態。側欄寬度、捲動邊界、sticky 的層級只在這裡定義一次；
捲動發生在 main 內部而不是整頁，因為標題列與左欄要一直看得到 ——
「需要你處理 N」是使用者在 300 列裡唯一的定位點

`GroupNav` 的群組計數用的是**全部欄位**的數字，不是篩選後的。側欄要回答「還有哪幾組沒處理完」，
跟著篩選變動的話，使用者篩到某一組之後就看不到其他組還剩多少

`TriageBar` 只有兩個分段。參考圖在這裡放了六個狀態 chip 加兩個排序下拉，
那要求使用者先讀懂六種分類才知道按哪一個

| 元件                 | 目的                                                   | 拿掉會怎樣                                        |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `FileDropZone`       | 拖放 ＋ 真的 `<input type="file">`                     | 鍵盤與讀螢幕器使用者無法上傳                      |
| `ParseProgressBar`   | 2px 細線 ＋ 階段文字                                   | 進度變成畫面主角，搶走「哪幾個要處理」的注意力    |
| `ParseErrorBanner`   | 失敗時保留欄位，給「重新解析」與「先審已抽到的」兩條路 | 使用者只剩重來一次                                |
| `AbortConfirmDialog` | 告知「已抽到的 46 個會留著」                           | 中止看起來像放棄全部，使用者不敢按                |
| `ReviewLayout`       | 純 grid：header／rail／main                            | 側欄寬度在四個地方各寫一次                        |
| `GroupNav`           | 承載「群組」這個維度 ＋ 每組待處理數                   | 每一列要重複印群組名 120 次                       |
| `TriageBar`          | 只有兩個分段 ＋ 搜尋                                   | 變成六個狀態 chip，使用者要先讀懂分類才知道按哪個 |
| `FieldGroupSection`  | sticky 區段標題，承接後端亂序的欄位                    | 捲到一半不知道自己在哪一組                        |
| `FieldRow`           | 渲染單列的五種樣態                                     | 見下方效能三條                                    |
| `FieldValueEditor`   | 依狀態決定值的呈現                                     | 八成不需要處理的列也長出輸入框外框，整頁都是框    |
| `CandidatePicker`    | 候選是選項，做成可按的鈕 ＋「都不對」出口              | 候選變成看起來不可按的標籤                        |
| `ConfidenceMark`     | 3px 色條 ＋ `aria-label`，不顯示百分比                 | 畫面出現 120 個沒有意義的百分比數字               |
| `SubmitGuard`        | 顯示 `blockingIssues` ＋「跳到第一個」                 | 送出鈕灰掉但不說為什麼、也不帶使用者去現場        |

### `FieldRow` 的三條硬規則

它會被實體化上百次，是 300 欄位下順不順的分水嶺：

1. **不呼叫 `useReviewStore()`** —— 所有資料由 props 傳入
2. **沒有 `watch`、沒有自己的 `computed`** —— 衍生值在父層算好
3. **事件用 `emit` 往上拋** —— `update:value` / `confirm` / `reset` / `choose`

違反的話，300 個訂閱者 ＋ 300 個 computed，任何一次編輯都會觸發全表重算

---

## 測試防的是什麼

題目寫明「看的是它防得住什麼」，所以每支測試都對應一個具體的改壞情境

| 測試                                       | 防住什麼                                                 |
| ------------------------------------------ | -------------------------------------------------------- |
| 亂序欄位分組後組內維持到達順序             | 有人把 `order` 改成依 `id` 或字母排序                    |
| 群組順序照 `KNOWN_GROUPS` 而非首次出現     | 有人拿掉 `groupOrder()` 直接用 Map 插入順序              |
| 必填沒填 → `canSubmit` 為 false            | 有人把阻擋條件改成「已確認數 === 總數」                  |
| 只填空白不算填了                           | 有人把檢查寫成 `value !== ''` 忘了 `trim()`              |
| 高把握度欄位不擋送出                       | 同上，反向防止變成「按 120 次確認」                      |
| `resetField` 回到後端原值                  | 有人把 `fields` 與 `drafts` 合併成一個物件               |
| `error` 事件不清空已收欄位                 | 有人把錯誤處理寫成回到 `idle`                            |
| `abort()` 關閉連線且 phase 轉 `aborted`    | 有人在中止時清空 `fields`                                |
| scope 結束自動斷線                         | 有人拿掉 `onScopeDispose`                                |
| 已結束後再中止不改狀態                     | 有人在 `abort()` 裡無條件寫 `phase`                      |
| `retry()` 沿用 `document_id`               | 有人把重試寫成重新上傳                                   |
| 有修改時 `retry()` 先要求確認              | 有人把確認拿掉，讓使用者的工作靜默消失                   |
| 只按過確認也算動過手                       | 有人把 `hasUserEdits` 改成只看 `touched`                 |
| 重跑後同一個 id 不沿用舊草稿               | 有人為了「保留使用者的工作」拿掉 `drafts.clear()`        |
| 必填補齊後才送得出去，payload 帶使用者的值 | 有人把 payload 改成讀 `fields` 而不是 `drafts`           |
| 已送出不是死路，可以回到審核               | 有人拿掉 `backToReview`                                  |
| 候選優先於低把握                           | 有人調換 `resolveStatus` 的判斷順序                      |
| 改值不會讓那一列離開待處理，確認才會       | 有人把 `touched` 加回放行條件，使用者只打得進一個字      |
| 確認之後再改值要重新確認                   | 有人讓 `setValue` 保留 `confirmed`，替沒看過的值背書     |
| 缺漏補值後是「已補值 · 請確認」            | 有人把它併進 `lowConfidence`，畫面說系統沒把握           |
| 上傳失敗給得出訊息                         | 有人吞掉 `uploadDocument` 的例外                         |
| 檔名用本地的 `File.name`                   | 有人為了「忠於 API」改回讀回傳值                         |
| Tailwind 有生效且 token 接得上 utility     | 有人把 `@import` 註解掉，整份樣式靜默失效                |
| `bg-blue-500` 不產生任何規則               | 有人把內建調色盤加回來，顏色就會被拿去標不需要處理的東西 |
| `#app` 的 `min-width` 是 1120px            | 有人拿掉它，窄螢幕會變成錯位而不是橫向捲動               |
| 中止對話框的欄位數會跟著串流跳             | 有人把它改成開啟當下的快照，那句話就變成謊言             |
| `DOCUMENT_EXPIRED` 時給的是「重新上傳」    | 有人一律給「重新解析」，使用者被鎖在必定 404 的迴圈裡    |
| 上傳區裡是真的 file input 且非 hidden      | 有人改成 div，鍵盤使用者就完全無法上傳                   |
| 安靜的列沒有色條、沒有確認鈕               | 有人把顏色用在不需要處理的列上，整個判斷就破功           |
| 把握度的數字只進 title，畫面上看不到       | 有人把百分比放回畫面                                     |
| 安靜的列也對得上 label、進得了 Tab 順序    | 有人改成「點一下才變輸入框」，鍵盤就跳過八成欄位         |
| 候選是可按的按鈕，且有「都不對」的出口     | 有人把候選畫成不可按的標籤                               |
| `FieldRow` 沒有 import 任何 composable     | 違反的話 log/07 的效能數字與「不做虛擬捲動」都不成立     |
| 事件被逐字元切開仍能還原                   | 有人拿掉 `sseParser` 的 buffer，改成每個 chunk 各自解析  |
| `\r\n` 被切在 `\r` 與 `\n` 之間不誤分幀    | 有人把換行正規化提前到 buffer 尾端也一起做               |
| 多位元組字元跨 chunk 不變問號              | 有人拿掉 `decoder.decode(value, { stream: true })`       |
| 404 → `DOCUMENT_EXPIRED` 且擋住重試        | 有人把所有 HTTP 失敗合併成一種錯誤碼                     |
| 400 沿用後端 `detail` 原文                 | 有人用固定文案蓋掉後端的參數錯誤說明                     |
| 沒送 `done` 就結束 → `STREAM_TRUNCATED`    | 有人把「讀完了」當成「成功完成」                         |
| `close()` 之後不冒出 `CONNECTION_LOST`     | 有人把 `AbortError` 當成連線失敗回報                     |

測試跑在真瀏覽器裡（Vitest browser mode ＋ Playwright），所以 `fetch`、`ReadableStream`、`TextDecoder` 都是原生的、`AbortController.abort()` 會真的讓後端收到斷線

---

## 沒把握的地方

七項，理由與替代方案見 [REVIEW.md](REVIEW.md#沒把握的地方)

| #   | 項目                             | 一句話                                                                      |
| --- | -------------------------------- | --------------------------------------------------------------------------- |
| 一  | `LOW_CONFIDENCE_THRESHOLD = 0.7` | 落在 mock 的雙峰真空段，怎麼調都一樣，等於沒被驗證過                        |
| 二  | 只有確認才算處理完               | 改值會讓確認過的列重新冒出來，資料對了，手感待實際使用驗證                  |
| 三  | `shallowReactive` 的 Map         | 「整個物件替換」的約束型別擋不住，違反了也不報錯                            |
| 四  | 重新解析一律丟棄修改             | 目前唯一安全的做法，但對使用者是實在的損失                                  |
| 五  | 中止後後端是否真的停止           | 依 Starlette 契約推論，沒對真實 uvicorn 驗過                                |
| 六  | 送出規格不明確                   | 規格未定，送出這條路徑一個錯誤碼都沒有，規格一到就是缺口                    |
| 七  | **最不確定的一段**               | `sseParser` 的 CRLF 跨 chunk 處理 —— 真實後端不會觸發，只有自己的測試在保護 |
