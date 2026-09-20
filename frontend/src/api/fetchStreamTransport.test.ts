import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchStreamTransport } from './fetchStreamTransport'
import type { ExtractedField } from '@/types/field'
import type {
  DoneEvent,
  ExtractionErrorEvent,
  ExtractionHandlers,
  StageEvent,
} from '@/types/extraction'

/** 收集 transport 送回來的所有事件，順序保留 */
function recorder() {
  const stages: StageEvent[] = []
  const fields: ExtractedField[] = []
  const errors: ExtractionErrorEvent[] = []
  const dones: DoneEvent[] = []
  const settled = Promise.withResolvers<void>()

  const handlers: ExtractionHandlers = {
    onStage: (e) => stages.push(e),
    onField: (f) => fields.push(f),
    onError: (e) => {
      errors.push(e)
      settled.resolve()
    },
    onDone: (e) => {
      dones.push(e)
      settled.resolve()
    },
  }

  return { handlers, stages, fields, errors, dones, settled: settled.promise }
}

/** 一段會慢慢吐出 chunk 的 SSE 回應 */
function streamingResponse(chunks: string[], { delayMs = 0 } = {}) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

function stubFetch(factory: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(factory)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HTTP 狀態碼對應 —— 換掉 EventSource 的理由', () => {
  it('404 對應 DOCUMENT_EXPIRED，訊息告訴使用者要重新上傳', async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ detail: '找不到這份文件' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const rec = recorder()

    fetchStreamTransport('gone', {}, rec.handlers)
    await rec.settled

    expect(rec.errors).toHaveLength(1)
    expect(rec.errors[0].code).toBe('DOCUMENT_EXPIRED')
    // 刻意不用後端的「找不到這份文件」—— 那句話沒告訴使用者該做什麼
    expect(rec.errors[0].message).toContain('重新上傳')
  })

  it('400 對應 BAD_REQUEST，並沿用後端的 detail 原文', async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ detail: 'field_count 請介於 1 到 300' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const rec = recorder()

    fetchStreamTransport('doc-1', { fieldCount: 999 }, rec.handlers)
    await rec.settled

    expect(rec.errors[0]).toEqual({
      code: 'BAD_REQUEST',
      message: 'field_count 請介於 1 到 300',
    })
  })

  it('其他狀態碼對應 HTTP_ERROR 並帶上狀態碼', async () => {
    stubFetch(async () => new Response('boom', { status: 502 }))
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.errors[0].code).toBe('HTTP_ERROR')
    expect(rec.errors[0].message).toContain('502')
  })

  it('連不上後端時對應 CONNECTION_LOST', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.errors[0].code).toBe('CONNECTION_LOST')
  })
})

describe('串流解析', () => {
  it('依序派送 stage、field、done', async () => {
    stubFetch(async () =>
      streamingResponse([
        'event: stage\ndata: {"stage":"辨識版面","progress":20}\n\n',
        'event: field\ndata: {"id":"f1","label":"品名","group":"基本資料","value":"經典原味火腿","confidence":0.96,"required":true,"page":1}\n\n',
        'event: done\ndata: {"stage":"完成","progress":100,"field_count":1}\n\n',
      ]),
    )
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.stages).toEqual([{ stage: '辨識版面', progress: 20 }])
    expect(rec.fields).toHaveLength(1)
    expect(rec.fields[0].label).toBe('品名')
    expect(rec.dones[0].field_count).toBe(1)
    expect(rec.errors).toEqual([])
  })

  it('後端主動送的 error 事件不會被當成連線失敗', async () => {
    stubFetch(async () =>
      streamingResponse([
        'event: field\ndata: {"id":"f1","label":"品名","group":"基本資料","value":"x","confidence":0.9,"required":true,"page":1}\n\n',
        'event: error\ndata: {"message":"解析服務暫時無法回應","code":"UPSTREAM_TIMEOUT"}\n\n',
      ]),
    )
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.fields).toHaveLength(1)
    expect(rec.errors).toEqual([{ message: '解析服務暫時無法回應', code: 'UPSTREAM_TIMEOUT' }])
  })

  it('多位元組字元被 chunk 切開也要還原', async () => {
    const encoder = new TextEncoder()
    const whole = encoder.encode(
      'event: field\ndata: {"id":"f1","label":"過敏原標示","group":"基本資料","value":"含大豆","confidence":0.9,"required":false,"page":2}\n\nevent: done\ndata: {"field_count":1}\n\n',
    )
    // 切在一個中文字的 UTF-8 位元組中間
    const cut = 40
    stubFetch(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(whole.slice(0, cut))
              controller.enqueue(whole.slice(cut))
              controller.close()
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    )
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.fields[0].label).toBe('過敏原標示')
    expect(rec.fields[0].value).toBe('含大豆')
  })

  it('串流沒送 done 就結束時回報 STREAM_TRUNCATED，已派送的欄位不受影響', async () => {
    stubFetch(async () =>
      streamingResponse([
        'event: field\ndata: {"id":"f1","label":"品名","group":"基本資料","value":"x","confidence":0.9,"required":true,"page":1}\n\n',
      ]),
    )
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.fields).toHaveLength(1)
    expect(rec.errors[0].code).toBe('STREAM_TRUNCATED')
  })

  it('不認得的事件型別直接忽略，不會讓串流停下來', async () => {
    stubFetch(async () =>
      streamingResponse([
        'event: heartbeat\ndata: {}\n\n',
        'event: done\ndata: {"field_count":0}\n\n',
      ]),
    )
    const rec = recorder()

    fetchStreamTransport('doc-1', {}, rec.handlers)
    await rec.settled

    expect(rec.dones).toHaveLength(1)
    expect(rec.errors).toEqual([])
  })
})

describe('中止', () => {
  it('close() 之後不再回報任何事件，包含錯誤', async () => {
    stubFetch(async () =>
      streamingResponse(
        [
          'event: field\ndata: {"id":"f1","label":"品名","group":"基本資料","value":"x","confidence":0.9,"required":true,"page":1}\n\n',
          'event: field\ndata: {"id":"f2","label":"批號","group":"基本資料","value":"y","confidence":0.9,"required":false,"page":1}\n\n',
          'event: done\ndata: {"field_count":2}\n\n',
        ],
        { delayMs: 20 },
      ),
    )
    const rec = recorder()

    const subscription = fetchStreamTransport('doc-1', {}, rec.handlers)
    subscription.close()
    await new Promise((r) => setTimeout(r, 120))

    // 中止是使用者的意圖，不是錯誤 —— 不該冒出 CONNECTION_LOST
    expect(rec.errors).toEqual([])
    expect(rec.dones).toEqual([])
  })

  it('close() 可以重複呼叫', async () => {
    stubFetch(async () => streamingResponse(['event: done\ndata: {}\n\n'], { delayMs: 20 }))
    const rec = recorder()

    const subscription = fetchStreamTransport('doc-1', {}, rec.handlers)
    subscription.close()
    subscription.close()
    await new Promise((r) => setTimeout(r, 60))

    expect(rec.errors).toEqual([])
  })
})

describe('query 參數', () => {
  it('把 ExtractOptions 轉成後端的三個參數', async () => {
    const spy = stubFetch(async () => streamingResponse(['event: done\ndata: {}\n\n']))
    const rec = recorder()

    fetchStreamTransport('doc-1', { fieldCount: 300, speed: 5, failAt: 3 }, rec.handlers)
    await rec.settled

    const url = new URL(String(spy.mock.calls[0][0]))
    expect(url.pathname).toBe('/api/documents/doc-1/extract')
    expect(url.searchParams.get('field_count')).toBe('300')
    expect(url.searchParams.get('speed')).toBe('5')
    expect(url.searchParams.get('fail_at')).toBe('3')
  })
})
