import { describe, it, expect } from 'vitest'
import { createReviewStore } from './useReviewStore'
import type { ExtractedField } from '@/types/field'

function field(partial: Partial<ExtractedField> & Pick<ExtractedField, 'id'>): ExtractedField {
  return {
    label: partial.id,
    group: '基本資料',
    value: '有值',
    confidence: 0.95,
    required: false,
    page: 1,
    ...partial,
  }
}

/** 模擬後端亂序送來的一份結果 */
function seed() {
  const store = createReviewStore()
  store.beginUpload()
  store.documentUploaded({ document_id: 'doc-1', filename: '檢驗報告_範例.pdf' })
  // 後端是照文件裡出現的順序送的，同群組不相鄰
  store.applyField(field({ id: 'f1', label: '品名', group: '基本資料', value: '', confidence: null, required: true })) // prettier-ignore
  store.applyField(field({ id: 'f2', label: '熱量', group: '營養標示' }))
  store.applyField(field({ id: 'f3', label: '批號', group: '基本資料', confidence: 0.39 }))
  store.applyField(field({ id: 'f4', label: '廠商名稱', group: '廠商資訊', value: '某某食品', required: true })) // prettier-ignore
  store.applyField(field({ id: 'f5', label: '蛋白質', group: '營養標示' }))
  store.applyField(field({ id: 'f6', label: '製造日期', group: '基本資料', value: '2026/03/15', confidence: 0.49, candidates: ['2026/03/15', '2026/05/30'] })) // prettier-ignore
  return store
}

describe('分組與順序', () => {
  it('把亂序送來的欄位分進群組，組內維持文件到達順序', () => {
    const store = seed()
    const groups = [...store.byGroup.value.entries()]

    // 群組順序照 KNOWN_GROUPS，不是照第一次出現的順序
    expect(groups.map(([name]) => name)).toEqual(['基本資料', '營養標示', '廠商資訊'])
    // 組內順序是 f1 → f3 → f6，不是依 id 或字母排序
    expect(store.byGroup.value.get('基本資料')).toEqual(['f1', 'f3', 'f6'])
    expect(store.byGroup.value.get('營養標示')).toEqual(['f2', 'f5'])
  })
})

describe('欄位狀態', () => {
  it('只有必填缺漏、多候選、低把握三種算待處理，高把握度不算', () => {
    const store = seed()

    expect(store.statusOf('f1')).toBe('missing') // 必填但沒抽到
    expect(store.statusOf('f3')).toBe('lowConfidence') // 0.39
    expect(store.statusOf('f6')).toBe('multiCandidate') // 候選優先於低把握
    expect(store.statusOf('f2')).toBe('ok') // 0.95
    expect(store.statusOf('f4')).toBe('ok') // 必填但有抽到

    expect(store.pendingIds.value).toEqual(['f1', 'f3', 'f6'])
    expect(store.pendingCount.value).toBe(3)
    expect(store.groupCounts.value.get('基本資料')).toEqual({ pending: 3, total: 3 })
    expect(store.groupCounts.value.get('營養標示')).toEqual({ pending: 0, total: 2 })
  })

  it('挑了候選答案之後該列就離開待處理', () => {
    const store = seed()
    store.chooseCandidate('f6', '2026/05/30')

    expect(store.statusOf('f6')).toBe('ok')
    expect(store.drafts.get('f6')?.value).toBe('2026/05/30')
    expect(store.pendingIds.value).toEqual(['f1', 'f3'])
  })
})

describe('送出阻擋', () => {
  it('必填欄位沒填就不能送出，填了才能', () => {
    const store = seed()

    expect(store.canSubmit.value).toBe(false)
    expect(store.blockingIssues.value.map((f) => f.label)).toEqual(['品名'])

    store.setValue('f1', '經典原味火腿')

    expect(store.blockingIssues.value).toEqual([])
    expect(store.canSubmit.value).toBe(true)
  })

  it('只填空白不算填了', () => {
    const store = seed()
    store.setValue('f1', '   ')

    expect(store.canSubmit.value).toBe(false)
    expect(store.statusOf('f1')).toBe('missing')
  })

  it('不要求逐一確認 —— 沒碰過的高把握度欄位不擋送出', () => {
    const store = seed()
    store.setValue('f1', '經典原味火腿')

    // f2、f5 從頭到尾沒被確認過
    expect(store.drafts.get('f2')?.confirmed).toBe(false)
    expect(store.canSubmit.value).toBe(true)
  })
})

describe('編輯與重設', () => {
  it('重設會回到後端原本抽到的值', () => {
    const store = seed()
    store.setValue('f6', '亂打的值')
    expect(store.drafts.get('f6')?.value).toBe('亂打的值')

    store.resetField('f6')

    expect(store.drafts.get('f6')?.value).toBe('2026/03/15')
    expect(store.drafts.get('f6')?.touched).toBe(false)
    // 後端的事實從頭到尾沒被動過
    expect(store.fields.get('f6')?.value).toBe('2026/03/15')
  })

  it('送出的是使用者確認後的值，並標示哪些被改過', () => {
    const store = seed()
    store.setValue('f1', '經典原味火腿')

    const payload = store.submitPayload.value
    expect(payload).toHaveLength(6)
    expect(payload[0]).toMatchObject({ id: 'f1', value: '經典原味火腿', edited: true })
    expect(payload[1]).toMatchObject({ id: 'f2', value: '有值', edited: false })
  })
})

describe('解析中途失敗', () => {
  it('錯誤事件不會清掉已經抽到的欄位', () => {
    const store = seed()
    store.applyError({ message: '解析服務暫時無法回應', code: 'UPSTREAM_TIMEOUT' })

    expect(store.phase.value).toBe('failed')
    expect(store.streamError.value?.code).toBe('UPSTREAM_TIMEOUT')
    expect(store.order.value).toHaveLength(6)
    expect(store.pendingCount.value).toBe(3)
  })

  it('重新解析會清掉舊欄位但保留 document_id', () => {
    const store = seed()
    store.applyError({ message: '壞了', code: 'UPSTREAM_TIMEOUT' })
    store.resetExtraction()

    expect(store.order.value).toEqual([])
    expect(store.streamError.value).toBeNull()
    expect(store.phase.value).toBe('parsing')
    expect(store.document.value?.document_id).toBe('doc-1')
  })
})
