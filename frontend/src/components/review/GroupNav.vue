<script setup lang="ts">
/**
 * 左欄：唯一的主指標 ＋ 群組導覽 ＋ 色條圖例。
 *
 * **「需要你處理」是這個畫面唯一的大數字。** 參考圖把總數、已確認、低把握、必填、
 * 缺漏、多候選六個統計並排，每一個都同樣大聲，等於沒有指標
 * （見 README 的介面設計）。
 *
 * 群組計數用的是全部欄位的數字，不是篩選後的 —— 側欄要回答「還有哪幾組沒處理完」，
 * 如果跟著篩選變動，使用者篩到某一組之後就看不到其他組還剩多少。
 */
import type { GroupName } from '@/types/field'

export interface GroupEntry {
  name: GroupName
  pending: number
  total: number
}

defineProps<{
  pendingCount: number
  groups: GroupEntry[]
  /** null 代表不限群組 */
  active: GroupName | null
}>()

const emit = defineEmits<{ select: [GroupName | null] }>()

const LEGEND = [
  { bar: 'bg-danger', text: '必填但沒抽到' },
  { bar: 'bg-caution', text: '系統把握度低' },
  { bar: 'bg-choose', text: '要你挑一個' },
  { bar: 'bg-line', text: '沒事，不必看' },
]
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="px-2 pb-4">
      <div class="text-muted text-xs tracking-[0.08em]">需要你處理</div>
      <div
        class="font-mono text-4xl leading-tight font-semibold tabular-nums"
        :class="pendingCount > 0 ? 'text-danger' : 'text-muted'"
      >
        {{ pendingCount }}
      </div>
    </div>

    <button
      type="button"
      class="rounded-md px-2 py-2 text-left text-sm"
      :class="active === null ? 'bg-line-faint text-ink font-medium' : 'text-ink hover:bg-sunken'"
      :aria-pressed="active === null"
      @click="emit('select', null)"
    >
      全部群組
    </button>

    <button
      v-for="group in groups"
      :key="group.name"
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm"
      :class="
        active === group.name ? 'bg-line-faint text-ink font-medium' : 'text-ink hover:bg-sunken'
      "
      :aria-pressed="active === group.name"
      @click="emit('select', active === group.name ? null : group.name)"
    >
      <span class="flex-1 truncate">{{ group.name }}</span>
      <span
        v-if="group.pending > 0"
        class="bg-danger-bg text-danger rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums"
      >
        {{ group.pending }}
      </span>
      <span class="text-muted w-6 text-right font-mono text-xs tabular-nums">{{
        group.total
      }}</span>
    </button>

    <!-- 顏色是這個畫面唯一的導航工具，所以圖例不是裝飾 -->
    <div class="border-line mt-5 border-t pt-4">
      <div class="text-muted px-2 pb-2 text-[11px] tracking-[0.08em]">顏色的意思</div>
      <div v-for="item in LEGEND" :key="item.text" class="flex items-center gap-2 px-2 py-1">
        <span class="h-4 w-[3px] shrink-0" :class="item.bar" />
        <span class="text-muted text-xs">{{ item.text }}</span>
      </div>
    </div>
  </div>
</template>
