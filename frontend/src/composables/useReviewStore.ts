import { computed, shallowReactive, ref } from 'vue'
import {
  createDraft,
  groupOrder,
  resolveStatus,
  type ExtractedField,
  type FieldDraft,
  type FieldStatus,
  type GroupName,
} from '@/types/field'
import type {
  DoneEvent,
  ExtractionErrorEvent,
  ExtractionProgress,
  ReviewPhase,
  StageEvent,
  UploadedDocument,
} from '@/types/extraction'

/**
 * 審核流程的唯一狀態來源。
 *
 * 不用 Pinia：整個流程是單一文件的單一狀態機，一支 composable 就涵蓋，
 * 多一層 store 只是把 ref 換個地方放（理由見根目錄 SCAFFOLD.md 的「刻意不裝」）。
 *
 * 兩條必須守住的規則：
 *
 * 1. 箭頭只有一個方向。fields 只被 SSE 寫入，drafts 只被使用者寫入。
 *    「重設」＝ 從 fields 讀值寫回 drafts，不是雙向綁定。
 *
 * 2. 所有衍生資料都是這裡的 computed，不是各元件自己算的。
 *    否則會出現「側欄說 5 個、清單只有 4 條有色」這種對不起來的情況。
 */
export function createReviewStore() {
  // ---- 原始狀態 -----------------------------------------------------------

  const phase = ref<ReviewPhase>('idle')
  const document = ref<UploadedDocument | null>(null)
  const progress = ref<ExtractionProgress>({ stage: '', percent: 0, total: null })
  const streamError = ref<ExtractionErrorEvent | null>(null)

  /** 後端說的事實，收到之後永遠不再變動 */
  const fields = shallowReactive(new Map<string, ExtractedField>())
  /** 使用者的意圖。永遠整個物件替換，不就地修改，讓 shallowReactive 能觸發更新 */
  const drafts = shallowReactive(new Map<string, FieldDraft>())
  /** 欄位到達的順序。後端是照文件裡出現的順序送的，這個順序本身就是資訊 */
  const order = ref<string[]>([])

  // ---- 索引 ---------------------------------------------------------------

  /**
   * 群組 → 欄位 id。
   * 後端不保證同群組相鄰，分組是前端的責任；組內維持文件順序。
   */
  const byGroup = computed<Map<GroupName, string[]>>(() => {
    const index = new Map<GroupName, string[]>()
    for (const id of order.value) {
      const field = fields.get(id)
      if (!field) continue
      const bucket = index.get(field.group)
      if (bucket) bucket.push(id)
      else index.set(field.group, [id])
    }
    // 依 KNOWN_GROUPS 的順序重排，未知群組排在後面
    const sorted = new Map<GroupName, string[]>()
    for (const group of groupOrder(index.keys())) {
      sorted.set(group, index.get(group)!)
    }
    return sorted
  })

  /** 單一欄位的狀態。色條、計數、篩選全部走這裡 */
  function statusOf(id: string): FieldStatus {
    const field = fields.get(id)
    const draft = drafts.get(id)
    if (!field || !draft) return 'ok'
    return resolveStatus(field, draft)
  }

  // ---- 衍生資料 -----------------------------------------------------------

  /** 需要使用者處理的欄位，維持文件順序 */
  const pendingIds = computed(() => order.value.filter((id) => statusOf(id) !== 'ok'))

  /** 唯一的主指標。不拆成「低把握 37／必填 3／缺漏 2／多候選 13」四個數字 */
  const pendingCount = computed(() => pendingIds.value.length)

  /** 每個群組的待處理數與總數，給左欄導覽用 */
  const groupCounts = computed(() => {
    const counts = new Map<GroupName, { pending: number; total: number }>()
    for (const [group, ids] of byGroup.value) {
      counts.set(group, {
        pending: ids.filter((id) => statusOf(id) !== 'ok').length,
        total: ids.length,
      })
    }
    return counts
  })

  /**
   * 擋住送出的欄位：法規必填但沒有值。
   *
   * 刻意不是「已確認數 === 總數」。使用者沒有義務逐一確認 108 個高把握度欄位，
   * 法規在意的只有這三個。
   */
  const blockingIssues = computed(() =>
    order.value
      .map((id) => fields.get(id))
      .filter((field): field is ExtractedField => !!field)
      .filter((field) => field.required && (drafts.get(field.id)?.value ?? '').trim() === ''),
  )

  const canSubmit = computed(() => blockingIssues.value.length === 0 && order.value.length > 0)

  /** 送出時真正要送的資料：使用者確認過的值，不是後端原本抽到的值 */
  const submitPayload = computed(() =>
    order.value.flatMap((id) => {
      const field = fields.get(id)
      const draft = drafts.get(id)
      if (!field || !draft) return []
      return [
        {
          id: field.id,
          label: field.label,
          group: field.group,
          page: field.page,
          required: field.required,
          value: draft.value,
          confirmed: draft.confirmed,
          edited: draft.value !== field.value,
        },
      ]
    }),
  )

  /** 解析是否還在進行中，決定要不要顯示骨架列與中止鈕 */
  const isStreaming = computed(() => phase.value === 'uploading' || phase.value === 'parsing')

  /**
   * 使用者動過手的欄位：改過值、挑過候選，或按過確認。
   *
   * 「按過確認」也算 —— 那同樣是使用者花時間做出的判斷，重新解析一樣會丟掉。
   * 只看 touched 會讓「審完 40 個高把握欄位」這種工作在警告裡被當成不存在。
   */
  const editedIds = computed(() =>
    order.value.filter((id) => {
      const draft = drafts.get(id)
      return !!draft && (draft.touched || draft.confirmed)
    }),
  )

  /** 重新解析前要不要先問使用者 */
  const hasUserEdits = computed(() => editedIds.value.length > 0)

  /**
   * 失敗或中止之後，能不能重跑同一份文件。
   *
   * 後端 README 寫明「服務重啟後已上傳的 document_id 會失效」，此時 extract 端點回 404。
   * 這種情況下重跑一百次都是 404，畫面必須改成引導「重新上傳」而不是「重新解析」——
   * 這正是傳輸層從 EventSource 換成 fetch 的理由：EventSource 讀不到狀態碼，
   * 分不出這件事與「後端整個掛了」。
   */
  const canRetry = computed(() => {
    if (!document.value) return false
    if (phase.value !== 'failed' && phase.value !== 'aborted') return false
    return streamError.value?.code !== 'DOCUMENT_EXPIRED'
  })

  // ---- SSE 事件寫入 -------------------------------------------------------

  function beginUpload() {
    reset()
    phase.value = 'uploading'
  }

  function documentUploaded(uploaded: UploadedDocument) {
    document.value = uploaded
    phase.value = 'parsing'
  }

  function applyStage(event: StageEvent) {
    progress.value = {
      stage: event.stage,
      percent: event.progress,
      total: event.total ?? progress.value.total,
    }
  }

  function applyField(field: ExtractedField) {
    // 同一條串流內 id 不會重複，這裡的 has() 只是防禦重送，不是合併機制。
    //
    // ⚠️ 絕對不要把這裡當成「跨解析保留使用者修改」的地方。
    // 後端的 id 是「洗牌之後的位置序號」（server.py 先 random.shuffle(picked)
    // 再用 f"f{i+1}" 編號），所以重跑一次同一份文件，f7 從「產品編號」變成「品名」
    // 是常態 —— 實測兩次解析 18 個欄位，label 對得起來的是 0 個。
    // 以 id 合併會把使用者對「品名」的修改套到現在叫「鈉」的欄位上，
    // 那是靜默的資料汙染，比整批丟掉更糟。
    // 重新解析一律走 discardExtraction()，見 REVIEW.md 的「重新解析會丟掉什麼」。
    if (!fields.has(field.id)) order.value = [...order.value, field.id]
    fields.set(field.id, field)
    if (!drafts.has(field.id)) drafts.set(field.id, createDraft(field))
  }

  function applyError(event: ExtractionErrorEvent) {
    // 已經抽到的欄位全部留著 —— 這是「解析到一半掛掉」與「重來一次」的差別
    streamError.value = event
    phase.value = 'failed'
  }

  function applyDone(event: DoneEvent) {
    progress.value = { stage: event.stage, percent: 100, total: event.field_count }
    phase.value = 'review'
  }

  /** 使用者主動中止。跟 failed 一樣保留已抽到的欄位，只是原因不同 */
  function markAborted() {
    phase.value = 'aborted'
  }

  // ---- 使用者操作 ---------------------------------------------------------

  function setValue(id: string, value: string) {
    const draft = drafts.get(id)
    if (!draft) return
    drafts.set(id, { ...draft, value, touched: true })
  }

  function confirm(id: string) {
    const draft = drafts.get(id)
    if (!draft) return
    drafts.set(id, { ...draft, confirmed: true })
  }

  /** 挑候選答案＝改值＋視為已處理，不必再按一次確認 */
  function chooseCandidate(id: string, value: string) {
    const draft = drafts.get(id)
    if (!draft) return
    drafts.set(id, { value, touched: true, confirmed: true })
  }

  /** 丟掉使用者的修改，回到後端原本抽到的值 */
  function resetField(id: string) {
    const field = fields.get(id)
    if (!field) return
    drafts.set(id, createDraft(field))
  }

  /**
   * 送出。
   *
   * 資料送出給後端的規格不明確，所以這裡不對規格做假設、也不打 API，只推進狀態
   * （理由見 log/08）。payload 由畫面決定怎麼處理 —— 目前是輸出到 console，
   * 然後 reset() 回到 idle 等下一份文件
   *
   * submitted 是個過場狀態，停留的時間就是使用者看完成對話框的那幾秒
   */
  function markSubmitted() {
    phase.value = 'submitted'
  }

  /** 整份重來（重新上傳）。重新解析不走這裡，因為 document 要留著 */
  function reset() {
    phase.value = 'idle'
    document.value = null
    progress.value = { stage: '', percent: 0, total: null }
    streamError.value = null
    fields.clear()
    drafts.clear()
    order.value = []
  }

  /**
   * 同一份文件重新解析：清掉欄位、草稿與錯誤，但保留 document_id。
   *
   * 名字裡有 discard 是刻意的 —— 這個動作會**丟掉使用者所有的修改與確認**。
   * 呼叫端有義務先看 hasUserEdits，該問的時候要問過使用者。
   *
   * 為什麼不能只清 fields 保留 drafts：後端的 id 跨解析不穩定，
   * 詳見 applyField 的註解與 ARCHITECTURE.md 的「重新解析會丟掉什麼」。
   */
  function discardExtraction() {
    progress.value = { stage: '', percent: 0, total: null }
    streamError.value = null
    fields.clear()
    drafts.clear()
    order.value = []
    phase.value = 'parsing'
  }

  return {
    // 狀態
    phase,
    document,
    progress,
    streamError,
    fields,
    drafts,
    order,
    // 衍生
    byGroup,
    statusOf,
    pendingIds,
    pendingCount,
    groupCounts,
    blockingIssues,
    canSubmit,
    submitPayload,
    isStreaming,
    canRetry,
    editedIds,
    hasUserEdits,
    // SSE
    beginUpload,
    documentUploaded,
    applyStage,
    applyField,
    applyError,
    applyDone,
    markAborted,
    // 使用者
    setValue,
    confirm,
    chooseCandidate,
    resetField,
    markSubmitted,
    reset,
    discardExtraction,
  }
}

export type ReviewStore = ReturnType<typeof createReviewStore>

/**
 * 整個 app 共用的那一份。
 *
 * 用模組單例而不是 provide/inject：只有一份文件、只有一個流程，
 * 而測試一律用 createReviewStore() 自己開一份乾淨的，不碰這個單例。
 */
let singleton: ReviewStore | null = null

export function useReviewStore(): ReviewStore {
  if (!singleton) singleton = createReviewStore()
  return singleton
}
