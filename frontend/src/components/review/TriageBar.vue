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
 *
 * 分段上的數字要跟清單對得上：選了群組就只算那一組。側欄的大數字維持全域，
 * 兩邊各答一件事 —— 側欄是「整份還剩多少」，這裡是「眼前這份清單有多少」。
 */
import type { TriageMode } from '@/composables/useFieldFilters'
import type { GroupName } from '@/types/field'

defineProps<{
  /** 已套用群組篩選時，是那一組的數字 */
  pendingCount: number
  /** 已套用群組篩選時，是那一組的數字 */
  totalCount: number
  /** 篩選後實際看得到幾列，用來說明「篩選沒中」跟「還沒有資料」的差別 */
  visibleCount: number
}>()

const mode = defineModel<TriageMode>('mode', { required: true })
const keyword = defineModel<string>('keyword', { required: true })
/** null 代表不限群組；由側欄選，這裡只負責顯示與就近取消 */
const group = defineModel<GroupName | null>('group', { default: null })

/** 跟 GroupNav 群組列的角標同一個樣式 */
const PENDING_BADGE =
  'bg-danger-bg text-danger rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums'
</script>

<template>
  <div class="border-line bg-surface flex shrink-0 items-center gap-4 border-b px-6 py-3">
    <!--
      選中的那段用 muted 實心：比白底加陰影明顯得多，又不搶 accent（送出鈕）的顏色。
      待處理數字用跟側欄群組一樣的角標，兩邊講的是同一種數字。
    -->
    <div
      role="group"
      aria-label="篩選欄位"
      class="border-line bg-line-faint flex gap-1 rounded-lg border px-1 py-0.5"
    >
      <button
        type="button"
        class="h-8 rounded-md px-3.5 text-[13px] font-semibold transition-colors"
        :class="
          mode === 'pending' ? 'bg-muted text-white' : 'text-muted hover:bg-surface hover:text-ink'
        "
        :aria-pressed="mode === 'pending'"
        @click="mode = 'pending'"
      >
        需要你處理
        <span v-if="pendingCount > 0" :class="PENDING_BADGE">{{ pendingCount }}</span>
      </button>
      <button
        type="button"
        class="h-8 rounded-md px-3.5 text-[13px] font-semibold transition-colors"
        :class="
          mode === 'all' ? 'bg-muted text-white' : 'text-muted hover:bg-surface hover:text-ink'
        "
        :aria-pressed="mode === 'all'"
        @click="mode = 'all'"
      >
        全部 <span class="font-mono text-xs tabular-nums">{{ totalCount }}</span>
      </button>
    </div>

    <!-- 群組是在側欄選的，離清單很遠；不提示的話，使用者會以為其他組的欄位不見了 -->
    <span
      v-if="group"
      class="border-line bg-sunken text-ink inline-flex h-8 items-center gap-1 rounded-md border pr-1 pl-3 text-[13px]"
    >
      群組：{{ group }}
      <button
        type="button"
        class="text-muted hover:bg-line-faint hover:text-ink flex justify-center items-center size-6 place-items-center rounded"
        :aria-label="`取消只看${group}`"
        @click="group = null"
      >
        ×
      </button>
    </span>

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
