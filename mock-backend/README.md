# 文件解析 Mock 服務

這是實作題用的後端，模擬「上傳文件 → 解析 → 逐筆回傳抽取結果」的流程。
不做真的解析，回傳的都是假資料。`server.py` 請勿修改，專心做前端就好；
`docker-compose.yml` 請自行加上你的前端服務。

## 啟動

```bash
docker compose up
```

服務會跑在 `http://localhost:8000`，已開放 CORS。

8000 如果被你機器上其他東西佔走了，改一下 `docker-compose.yml` 的 ports 就好。

不想用 Docker 也可以：

```bash
pip install -r requirements.txt
uvicorn server:app --reload
```

## API

### 1. 上傳文件

```
POST /api/documents
Content-Type: multipart/form-data
欄位名稱：file
```

檔案內容不會被解析，隨便傳什麼都可以。

回應：

```json
{ "document_id": "b74bacee-...", "filename": "report.pdf" }
```

### 2. 解析文件（SSE）

```
GET /api/documents/{document_id}/extract
```

回傳 `text/event-stream`，事件依序如下。

**`stage`** — 解析階段推進

```json
{ "stage": "辨識版面", "progress": 20 }
{ "stage": "抽取欄位", "progress": 75, "total": 18 }
```

**`field`** — 抽取到的欄位，一次一筆

```json
{
  "id": "f6",
  "label": "有效日期",
  "group": "基本資料",
  "value": "2027/01/08",
  "confidence": 0.51,
  "required": true,
  "page": 1
}
```

| 欄位 | 說明 |
|---|---|
| `label` | 欄位名稱。同一份結果裡不會重複 |
| `group` | 所屬群組，四種之一：`基本資料`、`營養標示`、`檢驗結果`、`廠商資訊`。**欄位是照文件裡出現的順序回傳的，同一個群組不保證相鄰** |
| `value` | 抽到的值。**空字串代表這個欄位在文件裡沒抽到** |
| `confidence` | 系統對這個欄位抽得準不準的把握程度，介於 0 到 1。1 表示非常確定，數值越低表示越有可能抽錯、越需要人工確認。**沒抽到的欄位這裡是 `null`** |
| `required` | 法規必填欄位（品名、有效日期、廠商名稱）為 `true`。這三個一定會出現在結果裡，而且其中會有一到兩個是沒抽到的 |
| `page` | 頁碼 |
| `candidates` | **選用欄位**，系統抓到不只一個候選答案時才會有。字串陣列，`value` 就是其中的第一個。大約一成的欄位會出現 |

有多個候選答案的欄位：

```json
{
  "id": "f12",
  "label": "製造日期",
  "group": "基本資料",
  "value": "2026/03/15",
  "candidates": ["2026/03/15", "2026/05/30"],
  "confidence": 0.49,
  "required": false,
  "page": 2
}
```

沒抽到的必填欄位：

```json
{
  "id": "f7",
  "label": "有效日期",
  "group": "基本資料",
  "value": "",
  "confidence": null,
  "required": true,
  "page": 1
}
```

**`error`** — 解析途中失敗

```json
{ "message": "解析服務暫時無法回應", "code": "UPSTREAM_TIMEOUT" }
```

**`done`** — 全部完成

```json
{ "stage": "完成", "progress": 100, "field_count": 18 }
```

### Query 參數

| 參數 | 預設 | 說明 |
|---|---|---|
| `field_count` | 18 | 回傳的欄位數量，可設 1～300 |
| `speed` | 1.0 | 速度倍率，`speed=5` 為五倍速，下限 0.1 |
| `fail_at` | -1 | 於第幾個欄位回傳 `error` 事件，從 0 起算，-1 表示不啟用 |

例如：

```
/api/documents/{id}/extract?field_count=120&speed=5
/api/documents/{id}/extract?field_count=300&speed=10
/api/documents/{id}/extract?fail_at=3
```

### 其他

- `GET /api/health` — 健康檢查
- 服務重啟後已上傳的 `document_id` 會失效
- 客戶端斷線時服務會停止運算，中止的行為請自行在前端實作
