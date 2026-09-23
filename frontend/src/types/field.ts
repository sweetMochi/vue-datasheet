/**
 * 後端抽取出來的欄位，以及使用者對它的修改。
 *
 * 這裡刻意拆成兩個型別：
 * - ExtractedField 是「後端說的事實」，收到之後永遠不再變動
 * - FieldDraft 是「使用者的意圖」，所有編輯只寫這一邊
 *
 * 合成同一個物件的話，「重設」就無法實作 —— 原值已經被蓋掉了。
 */

/** 後端文件裡宣告的四個群組 */
export const KNOWN_GROUPS = ['基本資料', '營養標示', '檢驗結果', '廠商資訊'] as const

export type KnownGroup = (typeof KNOWN_GROUPS)[number]

/**
 * 群組名稱刻意放寬成 string 而不是 KnownGroup 的聯集。
 * 後端偶爾會出包，真的送來第五種群組時，把欄位丟掉比顯示在「其他」更糟。
 * 排序時未知群組一律排在四個已知群組之後（見 groupOrder）。
 */
export type GroupName = KnownGroup | (string & {})

/** 後端 SSE `field` 事件的內容，收到後即為唯讀 */
export interface ExtractedField {
  id: string
  label: string
  group: GroupName
  /** 空字串代表這個欄位在文件裡沒抽到 */
  value: string
  /** 0～1，越低越可能抽錯。沒抽到的欄位為 null */
  confidence: number | null
  /** 法規必填（品名、有效日期、廠商名稱） */
  required: boolean
  page: number
  /** 系統抓到不只一個候選答案時才有，value 是其中第一個 */
  candidates?: string[]
}

/** 使用者對單一欄位的修改狀態 */
export interface FieldDraft {
  /** 目前的值。初始等於 ExtractedField.value */
  value: string
  /**
   * 使用者按過「確認」或挑過候選答案，而且之後沒有再改值。
   * 這是唯一的「處理完」訊號 —— 改值會把它清掉，見 setValue
   */
  confirmed: boolean
  /**
   * 使用者改過值或挑過候選答案。
   * 不影響狀態判斷，只用來決定重新解析前要不要先問使用者
   */
  touched: boolean
}

/**
 * 資訊狀態，決定左側色條的顏色
 *
 * missing 與 unconfirmed 只會出現在必填欄位：
 * - missing：必填但沒有值，唯一會擋住送出的狀態
 * - unconfirmed：後端沒抽到、使用者補上了值，但還沒按確認
 *
 * 判斷優先序：missing > (已確認就是 ok) > unconfirmed > multiCandidate > lowConfidence > ok
 */
export type FieldStatus = 'missing' | 'unconfirmed' | 'multiCandidate' | 'lowConfidence' | 'ok'

/**
 * 低把握度的界線。
 *
 * mock 後端產生的 confidence 是雙峰的：低的落在 0.31–0.68，高的落在 0.82–0.99，
 * 中間 0.68–0.82 是空的，所以 0.7 這個值落在縫隙裡，怎麼調都不會改變分類結果。
 * 真實後端的分布未必如此 —— 這是本專案最沒把握的數字之一，見 ARCHITECTURE.md。
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7

/** 建立一筆欄位的初始草稿 */
export function createDraft(field: ExtractedField): FieldDraft {
  return { value: field.value, confirmed: false, touched: false }
}

/**
 * 判斷單一欄位的狀態。
 *
 * 這是全專案唯一的狀態判準 —— 色條、待處理計數、篩選、群組角標全部從它衍生。
 * 散到各元件裡就會出現「側欄說 5 個、清單只有 4 條有色」這種對不起來的情況。
 */
export function resolveStatus(field: ExtractedField, draft: FieldDraft): FieldStatus {
  // 必填但沒有值 —— 唯一會擋住送出的狀態，優先於其他判斷
  if (field.required && draft.value.trim() === '') return 'missing'

  // 只有確認才算處理完。改值不算 —— 打第一個字就放行的話，
  // 在「需要你處理」裡那一列會連同輸入框一起被卸載，使用者只打得進一個字
  if (draft.confirmed) return 'ok'

  // 後端沒抽到、使用者補上的值：跟「把握度低」是不同的事，系統對它談不上把握，
  // 是使用者自己填的，所以另外標示，但一樣要按確認才離開待處理
  if (field.required && field.value.trim() === '') return 'unconfirmed'

  // 候選答案是「要你挑一個」，比「把握度低」更明確，所以排在前面
  if (field.candidates && field.candidates.length > 1) return 'multiCandidate'

  if (field.confidence !== null && field.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return 'lowConfidence'
  }

  // 非必填又沒抽到的欄位不標色：使用者無從得知文件裡到底有沒有這個值，
  // 標了也只是製造一堆他沒辦法處理的紅點
  return 'ok'
}

/**
 * 群組的顯示順序：四個已知群組照宣告順序，未知群組照出現順序排在後面。
 * 後端是照文件裡出現的順序回傳的，同群組不保證相鄰，所以順序必須由前端決定。
 */
export function groupOrder(groups: Iterable<GroupName>): GroupName[] {
  const seen = new Set(groups)
  const known = KNOWN_GROUPS.filter((g) => seen.has(g))
  const unknown = [...seen].filter((g) => !(KNOWN_GROUPS as readonly string[]).includes(g))
  return [...known, ...unknown]
}
