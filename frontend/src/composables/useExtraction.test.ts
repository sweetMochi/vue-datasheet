import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { createReviewStore } from './useReviewStore'
import { useExtraction } from './useExtraction'
import type { ExtractionHandlers, ExtractionTransport } from '@/types/extraction'
import type { ExtractedField } from '@/types/field'

const sampleField: ExtractedField = {
  id: 'f1',
  label: '品名',
  group: '基本資料',
  value: '經典原味火腿',
  confidence: 0.96,
  required: true,
  page: 1,
}

/** 假的傳輸層：不開真連線，把 handlers 交出來讓測試自己推事件 */
function fakeTransport() {
  const closed = vi.fn()
  let handlers: ExtractionHandlers | null = null
  const documentIds: string[] = []

  const transport: ExtractionTransport = (id, _options, incoming) => {
    documentIds.push(id)
    handlers = incoming
    return { close: closed }
  }

  return {
    transport,
    closed,
    documentIds,
    emit: () => handlers!,
  }
}

/** 在 effect scope 裡跑，讓 onScopeDispose 有地方掛 */
function withScope<T>(fn: () => T): { result: T; dispose: () => void } {
  const scope = effectScope()
  const result = scope.run(fn)!
  return { result, dispose: () => scope.stop() }
}

/** 只讓上傳這一支 fetch 成功，解析走假 transport */
function stubUpload(documentId = 'doc-1') {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ document_id: documentId, filename: 'a.pdf' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
}

/** 跑完上傳，停在「解析中、已建立串流」的狀態 */
async function parsing(transport: ExtractionTransport) {
  stubUpload()
  const store = createReviewStore()
  const { result: extraction, dispose } = withScope(() => useExtraction(store, { transport }))
  await extraction.start(new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  return { store, extraction, dispose }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('中止', () => {
  it('中止會關閉連線，已抽到的欄位留著', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    expect(store.order.value).toEqual(['f1'])

    extraction.abort()

    expect(fake.closed).toHaveBeenCalled()
    expect(store.phase.value).toBe('aborted')
    // 中止不是放棄全部：已經抽到的那些還在
    expect(store.order.value).toEqual(['f1'])
    expect(store.fields.get('f1')?.label).toBe('品名')
  })

  it('scope 結束時自動關閉連線，不留下沒人聽的串流', async () => {
    const fake = fakeTransport()
    const { dispose } = await parsing(fake.transport)

    dispose()

    expect(fake.closed).toHaveBeenCalled()
  })

  it('解析已經結束後再按中止，不會把狀態改回 aborted', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onDone({ stage: '完成', progress: 100, field_count: 0 })
    expect(store.phase.value).toBe('review')

    extraction.abort()

    expect(store.phase.value).toBe('review')
  })
})

describe('串流事件', () => {
  it('done 之後進入審核階段', async () => {
    const fake = fakeTransport()
    const { store } = await parsing(fake.transport)

    fake.emit().onStage({ stage: '抽取欄位', progress: 75, total: 18 })
    fake.emit().onField(sampleField)
    fake.emit().onDone({ stage: '完成', progress: 100, field_count: 1 })

    expect(store.progress.value).toEqual({ stage: '完成', percent: 100, total: 1 })
    expect(store.phase.value).toBe('review')
  })

  it('後端中途掛掉時保留已抽到的欄位，並記下錯誤碼', async () => {
    const fake = fakeTransport()
    const { store } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    fake.emit().onError({ message: '解析服務暫時無法回應', code: 'UPSTREAM_TIMEOUT' })

    expect(store.phase.value).toBe('failed')
    expect(store.streamError.value?.code).toBe('UPSTREAM_TIMEOUT')
    expect(store.order.value).toEqual(['f1'])
  })
})

describe('重新解析', () => {
  it('沿用同一個 document_id，不重傳檔案', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    fake.emit().onError({ message: '壞了', code: 'UPSTREAM_TIMEOUT' })

    const uploadCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(extraction.retry()).toBe('started')

    // 第二次串流用的還是同一個 id，而且沒有再打一次上傳端點
    expect(fake.documentIds).toEqual(['doc-1', 'doc-1'])
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(uploadCalls)
    expect(store.order.value).toEqual([])
    expect(store.streamError.value).toBeNull()
    expect(store.phase.value).toBe('parsing')
  })

  it('document_id 已失效時擋住重試，不再開第二條必定 404 的連線', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    fake.emit().onError({ message: '這份文件在後端已失效', code: 'DOCUMENT_EXPIRED' })

    expect(store.canRetry.value).toBe(false)
    expect(extraction.retry()).toBe('unavailable')

    // 只有最初那一條，沒有第二條
    expect(fake.documentIds).toEqual(['doc-1'])
    // 已抽到的欄位仍然留著，使用者可以先審完再重新上傳
    expect(store.order.value).toEqual(['f1'])
  })

  it('一般失敗仍然可以重試', async () => {
    const fake = fakeTransport()
    const { store } = await parsing(fake.transport)

    fake.emit().onError({ message: '解析服務暫時無法回應', code: 'UPSTREAM_TIMEOUT' })

    expect(store.canRetry.value).toBe(true)
  })

  it('使用者改過欄位時先要求確認，不直接丟掉他的工作', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    store.setValue('f1', '使用者改的值')
    fake.emit().onError({ message: '壞了', code: 'UPSTREAM_TIMEOUT' })

    expect(extraction.retry()).toBe('needs-confirm')

    // 沒有開新連線，修改也還在
    expect(fake.documentIds).toEqual(['doc-1'])
    expect(store.order.value).toEqual(['f1'])
    expect(store.drafts.get('f1')?.value).toBe('使用者改的值')
  })

  it('明確帶 discardEdits 才真的重跑', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    store.setValue('f1', '使用者改的值')
    fake.emit().onError({ message: '壞了', code: 'UPSTREAM_TIMEOUT' })

    expect(extraction.retry({ discardEdits: true })).toBe('started')

    expect(fake.documentIds).toEqual(['doc-1', 'doc-1'])
    expect(store.order.value).toEqual([])
    expect(store.drafts.size).toBe(0)
  })

  it('只按過確認、沒改過值，一樣要先問過', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    store.confirm('f1')
    fake.emit().onError({ message: '壞了', code: 'UPSTREAM_TIMEOUT' })

    // 確認也是使用者花時間做出的判斷，重跑一樣會丟掉
    expect(store.hasUserEdits.value).toBe(true)
    expect(extraction.retry()).toBe('needs-confirm')
  })

  it('沒有任何修改時不多問一句，直接重跑', async () => {
    const fake = fakeTransport()
    const { store, extraction } = await parsing(fake.transport)

    fake.emit().onField(sampleField)
    fake.emit().onError({ message: '壞了', code: 'UPSTREAM_TIMEOUT' })

    expect(store.hasUserEdits.value).toBe(false)
    expect(extraction.retry()).toBe('started')
  })
})

describe('上傳', () => {
  it('上傳失敗時給得出錯誤訊息，而不是停在空白的解析中', async () => {
    const fake = fakeTransport()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )

    const store = createReviewStore()
    const { result: extraction } = withScope(() =>
      useExtraction(store, { transport: fake.transport }),
    )

    await extraction.start(new File(['x'], 'a.pdf', { type: 'application/pdf' }))

    expect(extraction.uploadError.value).toContain('500')
    expect(store.phase.value).toBe('failed')
    // 沒有 document，重試按鈕也不該出現
    expect(store.canRetry.value).toBe(false)
  })
})
