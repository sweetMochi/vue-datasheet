<script setup lang="ts">
/**
 * 只有兩個分段，加一個搜尋。
 *
 * 參考圖在這裡放了六個狀態 chip（全部／低把握／必填／缺漏／多候選／已確認）加兩個排序下拉。
 * 那要求使用者先讀懂六種分類，才知道該按哪一個。這裡只問一個問題：
 * **你要看「還沒處理的」還是「全部」？**
 *
 * 排序刻意不做：依把握度排序會打散群組，而「同一組的要能一起看」是題目明確的需求
 * （見 README 的「決定不做什麼」）。
 */
import type { TriageMode } from '@/composables/useFieldFilters'

defineProps<{
  pendingCount: number
  totalCount: number
  /** 篩選後實際看得到幾列，用來說明「篩選沒中」跟「還沒有資料」的差別 */
  visibleCount: number
}>()

const mode = defineModel<TriageMode>('mode', { required: true })
const keyword = defineModel<string>('keyword', { required: true })
</script>

<template>
  <div class="border-line bg-surface flex shrink-0 items-center gap-4 border-b px-6 py-3">
    <div role="group" aria-label="篩選欄位" class="bg-line-faint flex gap-0.5 rounded-lg p-1">
      <button
        type="button"
        class="h-7 rounded-md px-3 text-[13px]"
        :class="mode === 'pending' ? 'bg-surface text-ink font-semibold shadow-sm' : 'text-muted'"
        :aria-pressed="mode === 'pending'"
        @click="mode = 'pending'"
      >
        需要你處理 {{ pendingCount }}
      </button>
      <button
        type="button"
        class="h-7 rounded-md px-3 text-[13px]"
        :class="mode === 'all' ? 'bg-surface text-ink font-semibold shadow-sm' : 'text-muted'"
        :aria-pressed="mode === 'all'"
        @click="mode = 'all'"
      >
        全部 {{ totalCount }}
      </button>
    </div>

    <label for="field-search" class="sr-only">搜尋欄位名稱或值</label>
    <input
      id="field-search"
      v-model="keyword"
      type="search"
      placeholder="搜尋欄位名稱或值"
      class="border-field bg-surface text-ink focus:border-accent h-8 w-72 rounded-md border px-3 text-[13px] outline-none"
    />

    <div class="flex-1" />

    <span class="text-muted text-xs">
      <template v-if="keyword">找到 {{ visibleCount }} 個 ｜ </template>依文件頁序排列
    </span>
  </div>
</template>
