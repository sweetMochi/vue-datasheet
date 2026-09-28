import { SSEExtractField } from '@/stores/api.type';

/**
 * 提取欄位列表
 */
export interface ExtractFieldList {
  /** 群組名稱 */
  group: string
  /** 欄位列表 */
  list: SSEExtractField[]
}
