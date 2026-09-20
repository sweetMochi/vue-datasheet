import { onScopeDispose, readonly, ref } from 'vue'
import { uploadDocument } from '@/api/uploadDocument'
import { fetchStreamTransport } from '@/api/fetchStreamTransport'
import type {
  ExtractionSubscription,
  ExtractionTransport,
  ExtractOptions,
} from '@/types/extraction'
import type { ReviewStore } from './useReviewStore'

export interface UseExtractionOptions {
  /** 傳輸層。預設是 fetch + ReadableStream，測試塞假的進來 */
  transport?: ExtractionTransport
  /** 解析參數，手動驗證時用來測 300 欄位、五倍速、中途失敗 */
  extract?: ExtractOptions
}

/**
 * 串流的生命週期擁有者。
 *
 * 元件只呼叫 start / abort / retry，不碰 fetch，也不碰 subscription。
 * 訂閱握在這裡而不是元件裡的原因：header 元件被卸載時 subscription 會跟著洩漏，
 * 後端要等到 TCP 超時才知道沒人在聽了。
 */
export function useExtraction(store: ReviewStore, options: UseExtractionOptions = {}) {
  const transport = options.transport ?? fetchStreamTransport
  const extractOptions = options.extract ?? {}

  /** 上傳本身的失敗（連不上、HTTP 4xx），跟串流中途失敗分開放 */
  const uploadError = ref<string | null>(null)

  let subscription: ExtractionSubscription | null = null
  let uploadController: AbortController | null = null

  function closeStream() {
    subscription?.close()
    subscription = null
  }

  function listen(documentId: string) {
    closeStream()
    subscription = transport(documentId, extractOptions, {
      onStage: (event) => store.applyStage(event),
      onField: (field) => store.applyField(field),
      onError: (event) => {
        // transport 收到 error 時已經自己 close 了，這裡只是把本地參照清乾淨
        subscription = null
        store.applyError(event)
      },
      onDone: (event) => {
        subscription = null
        store.applyDone(event)
      },
    })
  }

  /** 上傳並開始解析 */
  async function start(file: File) {
    abort({ silent: true })
    store.beginUpload()
    uploadError.value = null
    uploadController = new AbortController()

    try {
      const uploaded = await uploadDocument(file, { signal: uploadController.signal })
      store.documentUploaded(uploaded)
      listen(uploaded.document_id)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      uploadError.value = cause instanceof Error ? cause.message : '上傳失敗'
      store.applyError({ message: uploadError.value, code: 'UPLOAD_FAILED' })
    } finally {
      uploadController = null
    }
  }

  /**
   * 同一份文件重跑一次解析。
   * 不重傳檔案 —— document_id 還在，重傳只是讓使用者多等一次。
   *
   * 但 document_id 已經失效時（後端重啟過，extract 回 404）重跑一百次都是 404，
   * 所以擋在這裡，讓畫面改成引導重新上傳。
   */
  function retry(): boolean {
    const documentId = store.document.value?.document_id
    if (!documentId || !store.canRetry.value) return false
    store.resetExtraction()
    listen(documentId)
    return true
  }

  /**
   * 使用者不想等了。
   *
   * close() 會讓瀏覽器斷線，後端的 request.is_disconnected() 隨即為真並停止運算 ——
   * 中止不只是前端不看了，是真的讓後端別算了。
   */
  function abort({ silent = false }: { silent?: boolean } = {}) {
    uploadController?.abort()
    uploadController = null
    closeStream()
    if (!silent && store.isStreaming.value) store.markAborted()
  }

  // 元件卸載、HMR、切換文件都會走到這裡，確保不留下沒人聽的連線
  onScopeDispose(() => abort({ silent: true }))

  return {
    uploadError: readonly(uploadError),
    start,
    retry,
    abort,
  }
}
