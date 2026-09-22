<script setup lang="ts">
/**
 * 一列最左邊的 3px 色條。
 *
 * 刻意不顯示把握度的百分比：0.39 與 0.51 對使用者的動作沒有差別，都是「去看一眼」。
 * 數字只放進 title，要看的人 hover 得到，不要的人不會被 120 個假精確的數字洗版。
 *
 * 色條本身是 aria-hidden —— 同一件事右邊的文字標註已經說過了，
 * 讀螢幕器再念一次只是噪音。
 */
import { computed } from 'vue'
import { STATUS_VIEW } from './fieldStatusView'
import type { FieldStatus } from '@/types/field'

const props = defineProps<{
  status: FieldStatus
  confidence: number | null
}>()

const title = computed(() => {
  const { hint } = STATUS_VIEW[props.status]
  if (!hint) return undefined
  if (props.confidence === null) return hint
  return `${hint}（系統把握度 ${Math.round(props.confidence * 100)}%）`
})
</script>

<template>
  <div
    class="w-[3px] shrink-0"
    :class="STATUS_VIEW[status].bar"
    :title="title"
    aria-hidden="true"
    data-testid="confidence-mark"
  />
</template>
