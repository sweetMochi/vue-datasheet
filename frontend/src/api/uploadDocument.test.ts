import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadDocument } from './uploadDocument'
import { ApiError } from './http'

function stubFetch(factory: () => Promise<Response>) {
  const spy = vi.fn(factory)
  vi.stubGlobal('fetch', spy)
  return spy
}

function ok(body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
}

function pdf(name: string) {
  return new File(['x'], name, { type: 'application/pdf' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('檔名', () => {
  /**
   * 後端的 filename 只是我們送上去那個檔名的回音，繞了一圈編碼。
   * 同一份資訊本地就有，沒有理由用遠端的版本。
   */
  it('用本地的 File.name，不用 API 回傳的值', async () => {
    stubFetch(ok({ document_id: 'doc-1', filename: 'renamed-by-server.pdf' }))

    const result = await uploadDocument(pdf('檢驗報告_範例.pdf'))

    expect(result.filename).toBe('檢驗報告_範例.pdf')
    expect(result.document_id).toBe('doc-1')
  })

  it('API 回傳的檔名就算是對的，也一樣以本地為準', async () => {
    stubFetch(ok({ document_id: 'doc-1', filename: 'report.pdf' }))

    const result = await uploadDocument(pdf('我自己的檔名.pdf'))

    expect(result.filename).toBe('我自己的檔名.pdf')
  })
})

describe('回應驗證', () => {
  it('缺 document_id 時丟 ApiError，不讓壞資料流進 store', async () => {
    stubFetch(ok({ filename: 'a.pdf' }))

    await expect(uploadDocument(pdf('a.pdf'))).rejects.toBeInstanceOf(ApiError)
  })

  it('HTTP 失敗時帶上狀態碼', async () => {
    stubFetch(async () => new Response('nope', { status: 500 }))

    await expect(uploadDocument(pdf('a.pdf'))).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    })
  })

  it('連不上後端時 status 為 0，跟 HTTP 錯誤分得開', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(uploadDocument(pdf('a.pdf'))).rejects.toMatchObject({ status: 0 })
  })
})
