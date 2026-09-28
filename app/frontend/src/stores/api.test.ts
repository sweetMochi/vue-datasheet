import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApiStore } from './api'

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

    await useApiStore().uploadDocument({ file })

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

    await expect(useApiStore().uploadDocument({ file })).resolves.toEqual({
      document_id: 'abc',
      filename: '檢驗報告.pdf',
    })
  })

  it('HTTP 錯誤時讀取後端字串格式的 detail', async () => {
    mockFetch(Response.json({ detail: '檔案格式不支援' }, { status: 400 }))

    await expect(useApiStore().uploadDocument({ file })).rejects.toThrow('上傳失敗：檔案格式不支援')
  })

  it('HTTP 422 時讀取陣列格式的 detail', async () => {
    mockFetch(
      Response.json(
        { detail: [{ loc: ['body', 'file'], msg: 'Field required', type: 'missing' }] },
        { status: 422 },
      ),
    )

    await expect(useApiStore().uploadDocument({ file })).rejects.toThrow(
      '上傳失敗：file：Field required',
    )
  })

  it('body 不是 JSON 時依狀態碼使用預設訊息', async () => {
    // nginx 超過 client_max_body_size 時回傳的 HTML 錯誤頁
    mockFetch(new Response('<html>413 Request Entity Too Large</html>', { status: 413 }))

    await expect(useApiStore().uploadDocument({ file })).rejects.toThrow(
      '上傳失敗：檔案太大，請上傳 20 MB 以下的檔案',
    )
  })

  it('沒有預設訊息的狀態碼顯示 HTTP 狀態碼', async () => {
    mockFetch(new Response('', { status: 500 }))

    await expect(useApiStore().uploadDocument({ file })).rejects.toThrow('上傳失敗：HTTP 500')
  })

})

describe('extractDocument', () => {
  it.todo('依序收到事件，收到 done 時完成')
  it.todo('收到 SSE 的 error 事件時拋出錯誤')
  it.todo('沒收到 done 就結束時視為中斷')
  it.todo('HTTP 錯誤時讀取後端的 detail，無法解析時使用預設訊息')
  it.todo('cancelExtract 取消時拋出 AbortError')
  it.todo('新的抽取取代舊的，舊的不覆蓋狀態')
})
