import type { FieldStatus } from '@/types/field'

/**
 * 狀態 → 畫面表現。
 *
 * `resolveStatus()` 決定一列是什麼狀態，這裡決定那個狀態長什麼樣子。
 * 兩者都只有一份：色條、文字標註、hover 說明全部從這裡來，
 * 散到各元件裡就會出現「色條是紅的、旁邊卻寫把握度低」這種對不起來的情況。
 */
export interface StatusView {
  /** 左側 3px 色條的底色。ok 是透明的 —— 沒事的列不該發出任何顏色 */
  bar: string
  /** 右側短標註的文字色 */
  tone: string
  /** 右側短標註。ok 沒有標註 */
  label: string
  /** 完整說明，給 hover 與讀螢幕器用 */
  hint: string
  /**
   * 要不要出現「確認」鈕。
   * 必填缺漏沒有：它要的是把值補上，補上之後才變成 unconfirmed 等確認
   */
  confirmable: boolean
}

export const STATUS_VIEW: Record<FieldStatus, StatusView> = {
  missing: {
    bar: 'bg-danger',
    tone: 'text-danger',
    label: '法規必填 · 缺漏',
    hint: '法規必填欄位，文件裡沒有抽到。補上之前不能送出',
    confirmable: false,
  },
  unconfirmed: {
    bar: 'bg-caution',
    tone: 'text-caution',
    label: '已補值 · 請確認',
    hint: '文件裡沒抽到，這是你補上的值。確認之後就不必再看',
    confirmable: true,
  },
  multiCandidate: {
    bar: 'bg-choose',
    tone: 'text-choose',
    label: '多個候選',
    hint: '系統抓到不只一個候選答案，請挑一個，或是都不對就自己填',
    confirmable: true,
  },
  lowConfidence: {
    bar: 'bg-caution',
    tone: 'text-caution',
    label: '把握度低',
    hint: '系統對這個欄位沒什麼把握，請確認一下',
    confirmable: true,
  },
  ok: {
    bar: 'bg-transparent',
    tone: '',
    label: '',
    hint: '',
    confirmable: false,
  },
}
