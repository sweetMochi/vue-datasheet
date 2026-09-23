import { describe, it, expect } from 'vitest'
import { createReviewStore } from './useReviewStore'
import { useFieldFilters } from './useFieldFilters'
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

/** 後端亂序送來的一份結果：基本資料 3 筆（2 筆要處理）、營養標示 2 筆（全部沒事） */
function seeded() {
  const store = createReviewStore()
  store.beginUpload()
  store.documentUploaded({ document_id: 'doc-1', filename: 'a.pdf' })
  store.applyField(field({ id: 'f1', label: '品名', value: '', confidence: null, required: true }))
  store.applyField(field({ id: 'f2', label: '熱量', group: '營養標示', value: '132 大卡' }))
  store.applyField(field({ id: 'f3', label: '批號', confidence: 0.39, value: 'A26031501' }))
  store.applyField(field({ id: 'f4', label: '蛋白質', group: '營養標示', value: '12.4 公克' }))
  store.applyField(field({ id: 'f5', label: '內容量', value: '200 公克' }))
  return { store, filters: useFieldFilters(store) }
}

/** 攤平成 id 陣列，方便斷言順序 */
function visibleIds(sections: { ids: string[] }[]) {
  return sections.flatMap((s) => s.ids)
}

describe('分段', () => {
  it('預設只看需要處理的', () => {
    const { filters } = seeded()

    expect(filters.mode.value).toBe('pending')
    expect(visibleIds(filters.sections.value)).toEqual(['f1', 'f3'])
  })

  it('切到全部會照文件順序列出每一筆', () => {
    const { filters } = seeded()
    filters.mode.value = 'all'

    // 群組照 KNOWN_GROUPS 排，組內維持文件到達順序
    expect(filters.sections.value.map((s) => s.group)).toEqual(['基本資料', '營養標示'])
    expect(visibleIds(filters.sections.value)).toEqual(['f1', 'f3', 'f5', 'f2', 'f4'])
  })

  it('空群組不出現，否則「只看要處理的」會留下一排空標題', () => {
    const { filters } = seeded()

    // 營養標示那兩筆都沒事，整組不該出現
    expect(filters.sections.value.map((s) => s.group)).toEqual(['基本資料'])
  })

  it('確認之後那一列就從清單裡消失', () => {
    const { store, filters } = seeded()
    store.confirm('f3')

    expect(visibleIds(filters.sections.value)).toEqual(['f1'])
  })

  /**
   * 改值不算處理完。如果打一個字就放行，那一列會連同輸入框一起被卸載，
   * 使用者在「需要你處理」裡只打得進一個字
   */
  it('改值不會讓那一列消失，要按確認才離開', () => {
    const { store, filters } = seeded()
    store.setValue('f3', 'A2603150')

    expect(visibleIds(filters.sections.value)).toEqual(['f1', 'f3'])
  })

  it('補上缺漏的值也不會讓那一列消失', () => {
    const { store, filters } = seeded()
    store.setValue('f1', '經')

    expect(visibleIds(filters.sections.value)).toEqual(['f1', 'f3'])

    store.setValue('f1', '經典原味火腿')
    store.confirm('f1')

    expect(visibleIds(filters.sections.value)).toEqual(['f3'])
  })
})

describe('群組篩選', () => {
  it('選了群組就只剩那一組', () => {
    const { filters } = seeded()
    filters.mode.value = 'all'
    filters.group.value = '營養標示'

    expect(filters.sections.value.map((s) => s.group)).toEqual(['營養標示'])
    expect(visibleIds(filters.sections.value)).toEqual(['f2', 'f4'])
  })

  it('群組與分段是兩個獨立的條件，會疊加', () => {
    const { filters } = seeded()
    filters.group.value = '營養標示' // 這組沒有需要處理的

    expect(filters.sections.value).toEqual([])
    expect(filters.isEmptyResult.value).toBe(true)
  })
})

describe('搜尋', () => {
  it('比對欄位名稱', () => {
    const { filters } = seeded()
    filters.mode.value = 'all'
    filters.keyword.value = '品名'

    expect(visibleIds(filters.sections.value)).toEqual(['f1'])
  })

  it('比對的是使用者現在看到的值，不是後端原本抽到的', () => {
    const { store, filters } = seeded()
    filters.mode.value = 'all'
    store.setValue('f5', '350 公克')

    // 改過之後再搜尋，找的當然是他改成的內容
    filters.keyword.value = '350'
    expect(visibleIds(filters.sections.value)).toEqual(['f5'])

    filters.keyword.value = '200'
    expect(visibleIds(filters.sections.value)).toEqual([])
  })

  it('忽略大小寫與前後空白', () => {
    const { store, filters } = seeded()
    filters.mode.value = 'all'
    store.applyField(field({ id: 'f6', label: 'English Name', value: 'Classic Ham' }))

    filters.keyword.value = '  classic  '
    expect(visibleIds(filters.sections.value)).toEqual(['f6'])
  })
})

describe('「沒中」與「沒資料」是兩件事', () => {
  it('有資料但篩不到 → isEmptyResult 為真', () => {
    const { filters } = seeded()
    filters.keyword.value = '不存在的欄位'

    expect(filters.visibleCount.value).toBe(0)
    expect(filters.isEmptyResult.value).toBe(true)
  })

  it('根本還沒有資料 → isEmptyResult 為假，畫面該說的是別句話', () => {
    const store = createReviewStore()
    const filters = useFieldFilters(store)

    expect(filters.visibleCount.value).toBe(0)
    expect(filters.isEmptyResult.value).toBe(false)
  })
})

describe('清掉篩選', () => {
  it('清掉群組與關鍵字，但不動分段', () => {
    const { filters } = seeded()
    filters.mode.value = 'all'
    filters.group.value = '營養標示'
    filters.keyword.value = '熱量'

    filters.clear()

    // 分段是使用者對「要看什麼」的選擇，不屬於「篩選條件」
    expect(filters.mode.value).toBe('all')
    expect(filters.group.value).toBeNull()
    expect(filters.keyword.value).toBe('')
    expect(filters.visibleCount.value).toBe(5)
  })
})
