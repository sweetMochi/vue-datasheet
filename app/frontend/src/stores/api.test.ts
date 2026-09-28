import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApiStore } from './api'
import type { SSEExtractData } from './api.type'

/**
 * 以指定的回應或錯誤取代 fetch
 * 回傳 mock 以檢查呼叫參數
 */
function mockFetch(result: Response | Error) {
  const mock = vi.fn<typeof fetch>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  )
  // vi.stubGlobal 取代全域的 fetch
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  setActivePinia(createPinia())
  // 錯誤流程會印出 console.error，測試時不顯示
  vi.spyOn(console, 'error').mockImplementation(() => { })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('uploadDocument', () => {
  const file = new File(['%PDF-1.7'], '檢驗報告.pdf', { type: 'application/pdf' })

  it('以 multipart/form-data 上傳檔案', async () => {
    const fetchMock = mockFetch(Response.json({ document_id: 'abc', filename: '檢驗報告.pdf' }))

    await useApiStore().uploadDoc({ file })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/documents')
    expect(init?.method).toBe('POST')

    // 檔案放在 FormData 的 file 欄位，內容與原檔一致
    const body = init?.body as FormData
    const sent = body.get('file') as File
    expect(sent.name).toBe('檢驗報告.pdf')
    expect(await sent.text()).toBe('%PDF-1.7')
  })

  it('上傳成功時回傳 document_id 與 filename', async () => {
    mockFetch(Response.json({ document_id: 'abc', filename: '檢驗報告.pdf' }))

    await expect(useApiStore().uploadDoc({ file })).resolves.toEqual({
      document_id: 'abc',
      filename: '檢驗報告.pdf',
    })
  })

  it('HTTP 錯誤時讀取後端字串格式的 detail', async () => {
    mockFetch(Response.json({ detail: '檔案格式不支援' }, { status: 400 }))

    await expect(useApiStore().uploadDoc({ file })).rejects.toThrow('上傳失敗：檔案格式不支援')
  })

  it('HTTP 422 時讀取陣列格式的 detail', async () => {
    mockFetch(
      Response.json(
        { detail: [{ loc: ['body', 'file'], msg: 'Field required', type: 'missing' }] },
        { status: 422 },
      ),
    )

    await expect(useApiStore().uploadDoc({ file })).rejects.toThrow(
      '上傳失敗：file：Field required',
    )
  })

  it('body 不是 JSON 時依狀態碼使用預設訊息', async () => {
    // nginx 超過 client_max_body_size 時回傳的 HTML 錯誤頁
    mockFetch(new Response('<html>413 Request Entity Too Large</html>', { status: 413 }))

    await expect(useApiStore().uploadDoc({ file })).rejects.toThrow(
      '上傳失敗：檔案太大，請上傳 20 MB 以下的檔案',
    )
  })

  it('沒有預設訊息的狀態碼顯示 HTTP 狀態碼', async () => {
    mockFetch(new Response('', { status: 500 }))

    await expect(useApiStore().uploadDoc({ file })).rejects.toThrow('上傳失敗：HTTP 500')
  })

})

describe('extractDocument', () => {
  /** 依後端 _sse 的格式組成單一事件 */
  const sse = ({ event, data }: SSEExtractData) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

  /** 以文字片段組成 SSE 串流回應，每個片段為一次 read() 的結果 */
  function sseResponse(chunks: string[]) {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    })
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  }

  const stage: SSEExtractData = { event: 'stage', data: { stage: '讀取文件', progress: 25 } }
  const field: SSEExtractData = {
    event: 'field',
    data: {
      id: 'f1',
      label: '品名',
      group: '基本資料',
      value: '有機燕麥片',
      confidence: 0.92,
      required: true,
      page: 1,
    },
  }
  const done: SSEExtractData = {
    event: 'done',
    data: { stage: '完成', progress: 100, field_count: 1 },
  }

  it('依序收到事件，收到 done 時完成', async () => {
    // field 事件切成兩段，確認跨 chunk 的資料會接起來
    const fieldText = sse(field)
    const cut = fieldText.indexOf('有機')
    const fetchMock = mockFetch(
      sseResponse([sse(stage), fieldText.slice(0, cut), fieldText.slice(cut), sse(done)]),
    )
    const onEvent = vi.fn()
    const store = useApiStore()

    await expect(store.extractDoc('abc', onEvent)).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/documents/abc/extract')
    expect(init?.headers).toEqual({ Accept: 'text/event-stream' })

    expect(onEvent.mock.calls.map(([e]) => e)).toEqual([stage, field, done])
    expect(store.status).toBe('done')
  })

  it('收到 SSE 的 error 事件時拋出錯誤', async () => {
    const error: SSEExtractData = {
      event: 'error',
      data: { code: 'UPSTREAM_TIMEOUT', message: '上游服務逾時' },
    }
    mockFetch(sseResponse([sse(stage), sse(error), sse(field)]))
    const onEvent = vi.fn()
    const store = useApiStore()

    await expect(store.extractDoc('abc', onEvent)).rejects.toThrow(
      '抽取失敗：UPSTREAM_TIMEOUT 上游服務逾時',
    )

    // error 之前的事件照常送出，error 本身與之後的事件不送出
    expect(onEvent.mock.calls.map(([e]) => e)).toEqual([stage])
    expect(store.status).toBe('error')
  })

  it('沒收到 done 就結束時視為中斷', async () => {
    mockFetch(sseResponse([sse(stage), sse(field)]))
    const onEvent = vi.fn()
    const store = useApiStore()

    await expect(store.extractDoc('abc', onEvent)).rejects.toThrow('抽取串流在完成前中斷')

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(store.status).toBe('error')
  })

  it.todo('HTTP 錯誤時讀取後端的 detail，無法解析時使用預設訊息')
  it.todo('cancelExtract 取消時拋出 AbortError')
  it.todo('新的抽取取代舊的，舊的不覆蓋狀態')
})
