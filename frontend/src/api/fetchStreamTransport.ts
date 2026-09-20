import { apiUrl } from './http'
import { parseFieldEvent } from './parseFieldEvent'
import { createSseParser, type SseFrame } from './sseParser'
import type {
  DoneEvent,
  ExtractionErrorEvent,
  ExtractionHandlers,
  ExtractionSubscription,
  ExtractionTransport,
  ExtractOptions,
  StageEvent,
} from '@/types/extraction'

/**
 * 用 fetch + ReadableStream 實作傳輸層。
 *
 * 換掉 EventSource 的理由只有一個，但夠硬：**讀得到 HTTP 狀態碼**。
 *
 * 後端 README 寫明「服務重啟後已上傳的 document_id 會失效」，此時 extract 端點回
 * 404。EventSource 遇到非 200 只會觸發一個不帶狀態碼也不帶內文的 error 事件，
 * 前端無從分辨「後端掛了」與「這份文件已失效」—— 結果是畫面給出「重新解析」，
 * 使用者按下去又 404，被鎖在按不出去的錯誤畫面裡。
 *
 * 換成 fetch 之後 404 會對應到 DOCUMENT_EXPIRED，store 的 canRetry 隨之為 false，
 * 畫面就能改成引導重新上傳。
 *
 * 附帶的好處是不必再跟 EventSource 的自動重連角力：後端的 _sse() 從不送 id:，
 * 就算重連也無法續傳，只會整份重跑一次。
 */
export const fetchStreamTransport: ExtractionTransport = (
  documentId,
  options: ExtractOptions,
  handlers: ExtractionHandlers,
): ExtractionSubscription => {
  const url = apiUrl(`/api/documents/${encodeURIComponent(documentId)}/extract`, {
    field_count: options.fieldCount,
    speed: options.speed,
    fail_at: options.failAt,
  })

  const controller = new AbortController()
  /** 已經有結論（done / error / 使用者中止），之後一律不再回報 */
  let settled = false

  function fail(error: ExtractionErrorEvent) {
    if (settled) return
    settled = true
    controller.abort()
    handlers.onError(error)
  }

  /** 回傳 true 代表串流已經有結論，可以停止讀取 */
  function dispatch(frame: SseFrame): boolean {
    switch (frame.event) {
      case 'stage': {
        const data = readJson<StageEvent>(frame.data)
        if (data) handlers.onStage(data)
        return false
      }
      case 'field': {
        const field = parseFieldEvent(readJson<unknown>(frame.data))
        if (field) handlers.onField(field)
        return false
      }
      case 'error': {
        const data = readJson<ExtractionErrorEvent>(frame.data)
        fail(data ?? { message: '解析服務回報了一個無法解讀的錯誤', code: 'UNKNOWN' })
        return true
      }
      case 'done': {
        if (settled) return true
        settled = true
        controller.abort()
        const data = readJson<DoneEvent>(frame.data)
        handlers.onDone(data ?? { stage: '完成', progress: 100, field_count: 0 })
        return true
      }
      default:
        // 後端之後新增事件型別時直接忽略，不要讓整條串流停下來
        return false
    }
  }

  async function run() {
    let response: Response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      })
    } catch (cause) {
      if (isAbort(cause)) return
      fail({ message: '連不上解析服務，請確認後端是否啟動', code: 'CONNECTION_LOST' })
      return
    }

    if (!response.ok) {
      fail(await describeHttpFailure(response))
      return
    }
    if (!response.body) {
      fail({ message: '這個瀏覽器不支援串流回應', code: 'STREAM_UNSUPPORTED' })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser()

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        // stream: true 讓多位元組字元被 chunk 切開時不會變成問號
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          if (dispatch(frame)) return
        }
      }
      for (const frame of parser.push(decoder.decode())) {
        if (dispatch(frame)) return
      }
      for (const frame of parser.flush()) {
        if (dispatch(frame)) return
      }
    } catch (cause) {
      if (isAbort(cause)) return
      fail({ message: '與解析服務的連線中斷', code: 'CONNECTION_LOST' })
      return
    }

    // 串流結束了卻沒收到 done —— 後端被 kill 或反向代理把連線切了。
    // 已抽到的欄位留著，但要讓使用者知道這份結果不完整
    fail({ message: '解析在送出完成訊息前就結束了', code: 'STREAM_TRUNCATED' })
  }

  void run()

  return {
    close() {
      settled = true
      controller.abort()
    },
  }
}

/**
 * 把 HTTP 失敗翻成前端能據以決定「給哪顆按鈕」的錯誤碼。
 *
 * 404 刻意不用後端的 detail（「找不到這份文件」）：那句話沒有告訴使用者該做什麼。
 * 400 則直接用 detail，因為那是給開發者看的參數錯誤，原文最精確。
 */
async function describeHttpFailure(response: Response): Promise<ExtractionErrorEvent> {
  const detail = await readDetail(response)

  if (response.status === 404) {
    return {
      message: '這份文件在後端已失效（服務重啟過），請重新上傳',
      code: 'DOCUMENT_EXPIRED',
    }
  }
  if (response.status === 400) {
    return { message: detail ?? '解析參數不正確', code: 'BAD_REQUEST' }
  }
  return {
    message: detail ?? `解析服務回應 HTTP ${response.status}`,
    code: 'HTTP_ERROR',
  }
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null) {
      const detail = (payload as Record<string, unknown>).detail
      if (typeof detail === 'string' && detail !== '') return detail
    }
  } catch {
    // 不是 JSON 就算了，用預設訊息
  }
  return null
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function readJson<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}
