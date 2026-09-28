import { defineStore } from 'pinia';
import { ref } from 'vue';


/**
 * API 相關功能
 */
export const useFilterStore = defineStore('filter', () => {
  /** 當前選中的欄位分組 */
  const group = ref<string | null>(null)

  /** 切換確認類型 */
  const confirmation = ref<boolean>(true)

  /** 搜尋關鍵字 */
  const search = ref<string | null>(null)

  /**
   * 設置當前選中的欄位分組
   * @param newGroup 新的欄位分組值
   */
  function setGroup(newGroup: string | null): void {
    group.value = newGroup
  }

  /**
   * 設置切換確認類型
   * @param newSwap 新的切換確認類型值
   */
  function setConfirmation(newConfirmation: boolean): void {
    confirmation.value = newConfirmation
  }

  /**
   * 設置搜尋關鍵字
   * @param newSearch 新的搜尋關鍵字值
   */
  function setSearch(newSearch: string | null): void {
    search.value = newSearch
  }

  return {
    group,
    confirmation,
    search,
    setGroup,
    setConfirmation,
    setSearch
  }
})
