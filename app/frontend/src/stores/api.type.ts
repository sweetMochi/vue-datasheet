/**
 * 文件解析服務 API 型別
 *
 * 來源：http://localhost:8000/openapi.json（OpenAPI 3.1.0，v0.1.0）
 *
 */

/**
 * OpenAPI HTTP 驗證錯誤的單一項目
 */
export interface ValidationError {
  loc: (string | number)[]
  msg: string
  type: string
}

/**
 * OpenAPI HTTP 驗證錯誤的回應
 */
export interface HTTPValidationError {
  detail?: ValidationError[]
}

/**
 * HTTPException 的錯誤回應，如：404 找不到文件、400 參數超出範圍
 */
export interface HTTPErrorResponse {
  detail: string
}

/**
 * 上傳文件內容
 */
export interface ApiDocumentRq {
  file: Blob
}

/**
 * 上傳文件成功後建立的解析工作
 */
export interface ApiDocumentRs {
  /** 文件 ID */
  document_id: string
  /** 上傳時的檔名，無資料時為「未命名文件」 */
  filename: string
}

/**
 * 模擬抽取欄位的測試參數
 */
export interface ApiDocumentExtractTest {
  /** 回傳的欄位數量，介於 1 到 300，預設 18 */
  field_count?: number
  /** 速度倍率，預設 1.0 */
  speed?: number
  /** 於第幾個欄位回傳 error 事件，-1 表示不啟用，預設 -1 */
  fail_at?: number
}

/**
 * SSE 回傳單一欄位
 */
export interface SSEExtractField {
  /** 依序編號，如 f1、f2 */
  id: string
  /** 欄位標籤，超過一輪時會加上序號，如「品名（2）」 */
  label: string
  /** 欄位所屬群組，為動態值，如「基本資料」、「營養標示」 */
  group: string
  /** 系統首選值，必填欄位未抽到時為空字串 */
  value: string
  /** 信心分數 0～1，未抽到時為 null */
  confidence: number | null
  /** 是否為法規必填欄位 */
  required: boolean
  /** 所在頁碼，從 1 開始 */
  page: number
  /** 多個候選答案，第一個即為 value；可能為空值 */
  candidates?: string[]
}

/**
 * SSE 上傳文件的處理階段事件
 */
export interface SSEExtractStage {
  /** 處理階段 */
  stage: string
  /** 處理進度，0～100 */
  progress: number
  /** 欄位總數，僅「抽取欄位」階段提供 */
  total?: number
}

/**
 * SSE 上傳文件的錯誤事件
 */
export interface SSEExtractError {
  /** 錯誤訊息 */
  message: string
  /** 錯誤代碼，如 UPSTREAM_TIMEOUT */
  code: string
}

/**
 * SSE 上傳文件完成
 */
export interface SSEExtractDone {
  /** 處理階段 (基本上只有完成) */
  stage: string
  /** 進度 (固定為 100) */
  progress: 100
  /** 處理的欄位總數 */
  field_count: number
}

/**
 * SSE 事件名稱與 data 的對應
 */
export interface SSEExtractMap {
  /** 處理階段 */
  stage: SSEExtractStage
  /** 完成分析 */
  done: SSEExtractDone
  /** 單一欄位 */
  field: SSEExtractField
  /** 錯誤事件 */
  error: SSEExtractError
}

/**
 * SSE 上傳文件的事件
 */
export type SSEExtractData = {
  [K in SSEExtractType]: { event: K; data: SSEExtractMap[K] }
}[SSEExtractType]

/**
 * SSE 事件的類型
 *
 *      'stage': 處理階段
 *      'error': 錯誤事件
 *      'done': 完成分析
 *      'field': 單一欄位
 */
export type SSEExtractType = keyof SSEExtractMap
