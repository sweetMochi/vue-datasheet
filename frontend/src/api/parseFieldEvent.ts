import type { ExtractedField } from '@/types/field'

/**
 * 把 SSE `field` 事件的 JSON 轉成 ExtractedField。
 *
 * 後端偶爾會出包，所以這裡不信任任何一個欄位：
 * 型別不對就用安全的預設值補上，而不是讓整條串流炸掉。
 * 少一個 page 會顯示成 P0，總比整份解析結果消失好。
 *
 * 回傳 null 代表這筆資料連 id 都沒有，救不回來，呼叫端應該丟掉。
 */
export function parseFieldEvent(raw: unknown): ExtractedField | null {
  if (typeof raw !== 'object' || raw === null) return null
  const data = raw as Record<string, unknown>

  const id = typeof data.id === 'string' ? data.id : null
  if (!id) return null

  return {
    id,
    label: typeof data.label === 'string' ? data.label : id,
    group: typeof data.group === 'string' ? data.group : '其他',
    value: typeof data.value === 'string' ? data.value : '',
    confidence: typeof data.confidence === 'number' ? clamp01(data.confidence) : null,
    required: data.required === true,
    page: typeof data.page === 'number' && Number.isFinite(data.page) ? data.page : 0,
    // 單一候選等於沒有候選，正規化掉，免得每個消費端各自判斷 length > 1
    candidates: parseCandidates(data.candidates),
  }
}

function parseCandidates(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const values = raw.filter((v): v is string => typeof v === 'string')
  return values.length > 1 ? values : undefined
}

function clamp01(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}
