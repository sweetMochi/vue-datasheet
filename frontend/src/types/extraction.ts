/**
 * 解析流程的型別：SSE 事件、流程階段，以及傳輸層的可注入介面。
 *
 * 元件與 store 只認識這裡的介面，不認識 EventSource。
 * 測試因此可以塞一個假的 transport 進去，不需要真的後端，也不需要等真的時間。
 */

import type { ExtractedField } from './field'

/** 解析階段推進 */
export interface StageEvent {
  stage: string
  progress: number
  /** 只有「抽取欄位」這個階段會帶總數 */
  total?: number
}

/** 解析途中失敗 */
export interface ExtractionErrorEvent {
  message: string
  code: string
}

/** 全部完成 */
export interface DoneEvent {
  stage: string
  progress: number
  field_count: number
}

/** 上傳成功後後端回傳的文件 */
export interface UploadedDocument {
  document_id: string
  filename: string
}

/**
 * 整個流程的狀態機。
 *
 *   idle → uploading → parsing → review → submitted
 *                        │
 *                        ├─ aborted（使用者中止，已抽到的留著）
 *                        └─ failed （後端中途掛掉，已抽到的也留著）
 *
 * aborted 與 failed 都不是死路：欄位還在，使用者可以繼續審，也可以重跑。
 */
export type ReviewPhase =
  'idle' | 'uploading' | 'parsing' | 'review' | 'aborted' | 'failed' | 'submitted'

/** 解析進度，給進度細線用 */
export interface ExtractionProgress {
  stage: string
  percent: number
  /** 後端預告的欄位總數，「抽取欄位」階段之前為 null */
  total: number | null
}

/** 後端 extract 端點接受的 query 參數，測試與手動驗證都會用到 */
export interface ExtractOptions {
  /** 回傳的欄位數量，1～300 */
  fieldCount?: number
  /** 速度倍率，下限 0.1 */
  speed?: number
  /** 於第幾個欄位回傳 error 事件，-1 表示不啟用 */
  failAt?: number
}

/** transport 把事件送回來的四個出口 */
export interface ExtractionHandlers {
  onStage(event: StageEvent): void
  onField(field: ExtractedField): void
  onError(event: ExtractionErrorEvent): void
  onDone(event: DoneEvent): void
}

/** 一次解析連線。close() 必須是可重複呼叫的 */
export interface ExtractionSubscription {
  close(): void
}

/**
 * 傳輸層介面。
 *
 * 預設實作見 api/fetchStreamTransport.ts；測試用的假實作見 composables/useExtraction.test.ts。
 */
export type ExtractionTransport = (
  documentId: string,
  options: ExtractOptions,
  handlers: ExtractionHandlers,
) => ExtractionSubscription
