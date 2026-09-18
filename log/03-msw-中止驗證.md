# 03 · MSW 能否驗證「中止解析」

`2026-09-18` · **人工介入：推翻結論** — AI 原判定 MSW 驗證不了中止，人工提出改監聽 `request.signal`，實測後結論被推翻

## 問題

後端 README 明寫「客戶端斷線時服務會停止運算」 — 要確認假後端能不能驗證這條契約

## AI 的初版結論（錯誤）

檢查 `ReadableStream` 的 `cancel()` 有沒有被呼叫：

```ts
const stream = new ReadableStream({
  async start(c) {
    for (let i = 0; i < 40; i++) {
      try { c.enqueue(...); spy.emitted++ } catch { return }
      await new Promise((r) => setTimeout(r, 100))
    }
  },
  cancel() { spy.cancelled = true },   // ← 檢查這裡
})
```

```
>>> [EventSource] cancel 被呼叫: false / 斷線時 3 筆 → 600ms 後 8 筆
>>> [fetch] abort 後 read() → resolve done=false
>>> [fetch] cancel 被呼叫: false / 中止時 5 筆 → 600ms 後 16 筆
```

`cancel()` 從未被呼叫，客戶端斷線後伺服器繼續產出；換 `environment: 'node'` 完全不碰 happy-dom，結果一字不差

**當時下的結論**：MSW 驗證不了中止，所以那兩個 devDependency 沒有理由付

## 人工介入

人工提問：「若在 MSW 監聽 `request.signal.aborted` 是否能有效解決問題」

這指出 AI 測錯掛鉤了 — MSW 不是透過 `ReadableStream.cancel()` 傳遞中止，而是透過 handler 拿到的 `request.signal`

## 修正後的實測

```ts
http.get('http://localhost:8000/extract', ({ request }) => {
  request.signal.addEventListener('abort', () => { spy.abortEventFired = true })

  return new HttpResponse(new ReadableStream({
    async start(c) {
      for (let i = 0; i < 40; i++) {
        if (request.signal.aborted) { spy.stoppedAtTick = i; break }   // ← 關鍵
        try { c.enqueue(...); spy.emitted++ } catch { break }
        await new Promise((r) => setTimeout(r, 100))
      }
      try { c.close() } catch { /* 已關閉 */ }
    },
    cancel() { spy.streamCancelled = true },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
})
```

```
>>> [fetch]       abort 事件: true / signal.aborted: true / 因 signal 停在第 2 筆 / cancel(): false / 中止時 2 筆 → 最終 2 筆
>>> [EventSource] abort 事件: true / signal.aborted: true / 因 signal 停在第 3 筆 / cancel(): false / 中止時 3 筆 → 最終 3 筆
```

**2 → 2 筆、3 → 3 筆**，伺服器確實停了，`es.close()` 也會傳遞過去，不只是 `AbortController`

`cancel()` 依然不會被呼叫 — 那條路徑確實沒接上，但它不是 MSW 傳遞中止的管道

順帶解掉另一個誤判：先前 `reader.read()` 卡住導致 `for await` 永不結束，那是**handler 沒停下來**的副作用；接上 `signal` 後 handler 結束、串流關閉，`read()` 回 `done=true`，迴圈正常收尾

## 修正後仍存在的差異

**一、`read()` 回傳值不符規範**

| | abort 後 `reader.read()` |
|---|---|
| MSW | `resolve done=true` |
| 真瀏覽器 | `reject AbortError` |

影響有限，`done=true` 一樣能終結迴圈，但若程式碼用 `catch (e) { if (e.name === 'AbortError') ... }` 區分「使用者取消」與「後端出錯」，這段在 MSW 底下走不到，測試照樣綠燈

**二、自動重連測得出來**

原本以為這條也驗不到，實測發現可以：

```
>>> [MSW] 4 秒內建立連線次數: 2 / 收到欄位 16 筆
```

串流結束但客戶端沒 `close()`，polyfill 確實重連了 —「忘記 close 導致整份重新解析」這個坑，MSW 環境抓得到

**三、樣式與真實互動仍然不行**

`getComputedStyle` 拿不到真值、`input.fill()` 不是真的鍵盤事件，這跟中止無關，是 happy-dom 的固有限制

## 兩種方案重新評估

| | MSW + polyfill | browser mode |
|---|---|---|
| 驗證中止契約 | ✅ 需自己輪詢 `signal.aborted` | ✅ 天然 |
| 驗證自動重連 | ✅ | ✅ |
| `AbortError` 語意 | ❌ | ✅ |
| 樣式可測 | ❌ | ✅ |
| 真實鍵盤／滑鼠事件 | ❌ | ✅ |
| 安裝成本 | 2 個 devDep + setup 檔 | 114.6 MB Chromium |
| 測試速度 | ~1s | ~0.8s |

## 結果

維持 browser mode，但**推薦理由已更換**：

- ~~MSW 在最關鍵的中止需求上失效~~ ← 這句話是錯的
- 改為：原生 API 無 polyfill 落差、樣式與真實互動可測

若日後認為 114.6 MB 的下載對驗收體驗影響太大，換回 MSW 是站得住腳的選項

## 對照組程式碼

browser mode 這邊的假後端是 Vite middleware，中止由 Node `http` 模組原生傳遞：

```ts
server.middlewares.use('/__extract', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })

  let alive = true
  req.on('close', () => { alive = false; spy.cancelled = true })   // ← 真的會觸發

  let i = 0
  const tick = () => {
    if (!alive) return                       // 斷線後立刻停止運算
    if (i >= 40) { res.end(); return }
    res.write(`event: field\ndata: {"label":"欄位${i}"}\n\n`)
    spy.emitted = ++i
    setTimeout(tick, 100)
  }
  tick()
})
```

```
>>> [browser] cancel 被呼叫: true / 斷線時 3 筆 → 600ms 後 3 筆
```
