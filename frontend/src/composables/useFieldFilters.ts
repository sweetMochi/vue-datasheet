import { computed, ref, type Ref } from 'vue'
import type { GroupName } from '@/types/field'
import type { ReviewStore } from './useReviewStore'

/** 清單的兩個分段：只看要處理的，或全部 */
export type TriageMode = 'pending' | 'all'

/**
 * 群組、分段、搜尋三個條件組合出「要渲染的欄位 id」。
 *
 * 獨立成 composable 的原因：這段是純資料轉換，測試不需要掛載任何元件。
 * 分組後的結構直接給 FieldGroupSection 用，元件不必再自己 groupBy 一次。
 */
export function useFieldFilters(store: ReviewStore) {
  const mode: Ref<TriageMode> = ref('pending')
  /** null 代表不限群組 */
  const group = ref<GroupName | null>(null)
  const keyword = ref('')

  const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())

  function matchesKeyword(id: string): boolean {
    const query = normalizedKeyword.value
    if (!query) return true
    const field = store.fields.get(id)
    const draft = store.drafts.get(id)
    if (!field) return false
    // 搜尋同時涵蓋標籤與「使用者現在看到的值」，而不是後端原本抽到的值
    return (
      field.label.toLowerCase().includes(query) ||
      (draft?.value ?? '').toLowerCase().includes(query)
    )
  }

  /** 分組後的結果，維持群組順序與組內的文件順序 */
  const sections = computed(() => {
    const result: { group: GroupName; ids: string[] }[] = []
    for (const [name, ids] of store.byGroup.value) {
      if (group.value && name !== group.value) continue
      const visible = ids.filter(
        (id) => (mode.value === 'all' || store.statusOf(id) !== 'ok') && matchesKeyword(id),
      )
      // 空群組不出現在清單裡，否則「只看要處理的」會留下一排空標題
      if (visible.length > 0) result.push({ group: name, ids: visible })
    }
    return result
  })

  const visibleCount = computed(() => sections.value.reduce((sum, s) => sum + s.ids.length, 0))

  /** 有篩選條件但一筆都沒中，跟「還沒有資料」是兩件事，畫面上的文案不同 */
  const isEmptyResult = computed(() => visibleCount.value === 0 && store.order.value.length > 0)

  function clear() {
    group.value = null
    keyword.value = ''
  }

  return { mode, group, keyword, sections, visibleCount, isEmptyResult, clear }
}
