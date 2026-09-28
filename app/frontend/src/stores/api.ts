import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readErrorMsg } from './api.error'
import type {
  ApiDocumentExtractTest,
  ApiDocumentRq,
  ApiDocumentRs,
  SSEExtractData,
  SSEExtractType,
} from './api.type'

/**
 * API 相關功能
 */
export const useApiStore = defineStore('api', () => {
  /** SSE 事件階段 */
  const status = ref<SSEExtractType | null>(null)

  /** 文件資訊 */
  const docInfo = ref<ApiDocumentRs | null>(null)

  /** 進行中的抽取，用來取消，以及判斷是否已被新的抽取取代 */
  let extractController: AbortController | null = null

  /**
   * 上傳文件
   * @param rqData 上傳文件的請求資料
   */
  async function uploadDoc(rqData: ApiDocumentRq) {
    try {
      const form = new FormData()
      form.append('file', rqData.file)

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: form,
      })

      if (!response.ok) {
        throw new Error(`上傳失敗：${await readErrorMsg(response)}`)
      }

      return (await response.json()) as ApiDocumentRs
    } catch (error) {
      console.error('Error uploading documents:', error)
      throw error
    }
  }

  /**
   * 抽取文件欄位
   * @param id 文件 ID
   * @param onEvent SSE 事件回調方法
   * @param options 抽取文件的選項
   */
  async function extractDoc(
    id: string,
    onEvent: (e: SSEExtractData) => void,
    options?: ApiDocumentExtractTest,
  ) {
    /** 是否完成抽取 */
    let finished = false

    /** 抽取文件的 API URL */
    let url = `/api/documents/${id}/extract`

    // 開始前重設，避免畫面顯示上一次的結果
    status.value = null

    // 取消上一次的抽取
    extractController?.abort()

    // 建立新的 AbortController，用於取消這次的抽取
    const controller = new AbortController()
    extractController = controller

    // 如果有傳入測試參數
    if (options) {
      const params = new URLSearchParams()

      // 使用 entries 避免型別檢查出現錯誤
      for (const [key, val] of Object.entries(options)) {
        if (val !== undefined) params.append(key, String(val))
      }

      // 如果有查詢字串
      if (params.size > 0) {
        url += `?${params.toString()}`
      }
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream', // 聲明接收事件流
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`抽取失敗：${await readErrorMsg(response)}`)
      }

      if (!response.body) {
        throw new Error('抽取失敗：伺服器沒有回傳資料')
      }

      // 解析 SSE 事件流為可讀的字串
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

      // 解析 SSE 事件流返回自訂回調事件
      await parseSSE(reader, (res) => {
        // 出現錯誤
        if (res.event === 'error') {
          throw new Error(`抽取失敗：${res.data.code} ${res.data.message}`)
        }

        // 完成抽取
        if (res.event === 'done') {
          finished = true
        }

        // 更新狀態並觸發回調
        status.value = res.event
        onEvent(res)
      })

      if (!finished) {
        throw new Error('抽取串流在完成前中斷')
      }
    } catch (error) {
      // 如果這次的抽取是目前的抽取
      if (extractController === controller) {
        // 如果錯誤不是由使用者取消引起的
        if ((error as Error).name !== 'AbortError') {
          status.value = 'error'
          console.error('Error extracting documents:', error)
        } else {
          status.value = null
        }
      }

      throw error
    } finally {
      if (extractController === controller) {
        extractController = null
      }
    }
  }

  /**
   * 解析 SSE 事件流
   * @param reader 可讀的 SSE 事件流
   * @param onEvent 事件回調方法
   */
  async function parseSSE(
    reader: ReadableStreamDefaultReader<string>,
    onEvent: (e: SSEExtractData) => void,
  ) {
    let buffer = ''
    let event: SSEExtractType | null = null
    let dataLines: string[] = []

    /**
     * 根據 event 回傳資料
     */
    const dispatch = () => {
      if (event && dataLines.length) {
        onEvent({ event, data: JSON.parse(dataLines.join('\n')) } as SSEExtractData)
      }

      // 復原初始狀態
      event = null
      dataLines = []
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split(/\r\n|\r|\n/)

        // 將最後一行保留在 buffer 中，避免資料被截斷
        buffer = lines.pop() ?? ''

        // 逐行解析 SSE 資料
        for (const line of lines) {
          // 空行表示一個事件結束，觸發 dispatch
          if (line === '') {
            dispatch()
          }
          // 解析 event 行，slice 掉 'event:' 前綴，並將其轉換為 SSEExtractType
          else if (line.startsWith('event:')) {
            event = line.slice(6).replace(/^ /, '') as SSEExtractType
          }
          // 解析 data 行，slice 掉 'data:' 前綴，並將其加入 dataLines
          else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''))
          }
        }
      }
    } catch (error) {
      // stream 已出錯時 cancel() 會以相同錯誤 reject
      // 下方已經 throw，這裡不需要重複處理
      reader.cancel().catch(() => { })

      throw error
    } finally {
      // 讀完時自動釋放
      reader.releaseLock()
    }
  }

  /**
   * 取消進行中的抽取
   */
  function cancelExtract() {
    extractController?.abort()
  }

  return {
    status,
    docInfo,
    uploadDoc,
    extractDoc,
    cancelExtract,
  }
})
