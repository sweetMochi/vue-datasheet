import { apiUrl } from './http'
import { parseFieldEvent } from './parseFieldEvent'
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
 * 用原生 EventSource 實作傳輸層。
 *
 * ⚠️ 這不是預設實作 —— 目前預設是 fetchStreamTransport。
 *
 * 保留的原因有兩個：
 * 一、同一個 ExtractionTransport 介面被兩種完全不同的實作填過，本身就是
 *     「傳輸層可抽換」這個設計的證據。
 * 二、它示範了 EventSource 做不到的事：非 200 回應只會觸發一個不帶狀態碼、
 *     不帶內文的 error，所以 404（document_id 已失效）與「後端整個掛了」
 *     在這裡分不出來，一律變成 CONNECTION_LOST。這正是換掉它的理由。
 *
 * 兩個必須守住的行為：
 *
 * 1. 收到 done 或 error 之後一定要 close()。
 *    EventSource 的預設行為是「連線結束就自動重連」，而後端在送完 done 之後
 *    就會關閉串流 —— 不主動 close 的話瀏覽器會再連一次，整份文件會被重新解析一遍。
 *
 * 2. close() 要能重複呼叫。
 *    使用者按中止、元件卸載、done 事件三條路徑都會呼叫它。
 */
export const eventSourceTransport: ExtractionTransport = (
  documentId,
  options: ExtractOptions,
  handlers: ExtractionHandlers,
): ExtractionSubscription => {
  const url = apiUrl(`/api/documents/${encodeURIComponent(documentId)}/extract`, {
    field_count: options.fieldCount,
    speed: options.speed,
    fail_at: options.failAt,
  })

  const source = new EventSource(url)
  let settled = false

  const close = () => {
    settled = true
    source.close()
  }

  source.addEventListener('stage', (event) => {
    const data = readJson<StageEvent>(event)
    if (data) handlers.onStage(data)
  })

  source.addEventListener('field', (event) => {
    const field = parseFieldEvent(readJson<unknown>(event))
    if (field) handlers.onField(field)
  })

  source.addEventListener('error', (event) => {
    // 後端主動送的 error 事件帶 data；連線層的錯誤沒有 data，走下面的 onerror
    const data = readJson<ExtractionErrorEvent>(event)
    if (!data) return
    close()
    handlers.onError(data)
  })

  source.addEventListener('done', (event) => {
    const data = readJson<DoneEvent>(event)
    close()
    handlers.onDone(data ?? { stage: '完成', progress: 100, field_count: 0 })
  })

  // 連線層失敗：後端沒起來、404、網路斷掉。
  // 已經結束的串流不再回報，否則正常收完 done 之後還會多一次錯誤。
  source.onerror = () => {
    if (settled) return
    close()
    handlers.onError({
      message: '與解析服務的連線中斷',
      code: 'CONNECTION_LOST',
    })
  }

  return { close }
}

function readJson<T>(event: Event): T | null {
  const data = (event as MessageEvent<string>).data
  if (typeof data !== 'string' || data === '') return null
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}
