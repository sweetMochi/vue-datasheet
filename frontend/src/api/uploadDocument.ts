import { ApiError, apiUrl } from './http'
import type { UploadedDocument } from '@/types/extraction'

/**
 * 上傳文件，換一個 document_id 回來。
 *
 * 刻意只做上傳這一件事，不順便開始解析：
 * 後端掛掉時使用者要能「重新解析」而不必重傳整份檔案。
 */
export async function uploadDocument(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<UploadedDocument> {
  const body = new FormData()
  body.append('file', file)

  let response: Response
  try {
    response = await fetch(apiUrl('/api/documents'), {
      method: 'POST',
      body,
      signal: options.signal,
    })
  } catch (cause) {
    // fetch 只有在網路層失敗時才 reject；AbortError 讓呼叫端自己分辨
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError('連不上解析服務，請確認後端是否啟動', 0)
  }

  if (!response.ok) {
    throw new ApiError(`上傳失敗（HTTP ${response.status}）`, response.status)
  }

  const payload: unknown = await response.json()
  if (!isUploadedDocument(payload)) {
    throw new ApiError('上傳回應的格式不如預期', response.status)
  }

  // 檔名用本地的 File.name，刻意丟掉 API 回傳的那個。
  //
  // 後端的 filename 只是把我們剛送上去的檔名原封不動回傳（server.py 的 upload_document），
  // 它不是後端的知識，而是一趟編碼往返之後的回音。同一份資訊，本地這份少繞一圈，
  // 沒有任何理由用遠端的版本。
  return { document_id: payload.document_id, filename: file.name }
}

function isUploadedDocument(value: unknown): value is UploadedDocument {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.document_id === 'string' && typeof candidate.filename === 'string'
}
