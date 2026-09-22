<script setup lang="ts">
/**
 * 多個候選答案。
 *
 * 候選是**選項**，不是展示用的標籤 —— 參考圖把它們畫成紫色膠囊，看起來不可按，
 * 使用者要另外去輸入框手打一次。這裡直接做成按鈕。
 *
 * 最後一顆「都不對，自己填」是刻意留的出口：系統給的三個可能全錯，
 * 沒有這顆的話使用者會以為只能從這三個裡面挑。
 */
defineProps<{
  candidates: string[]
  /** 目前草稿的值，用來標出哪一顆是選中的 */
  current: string
}>()

const emit = defineEmits<{
  choose: [string]
  /** 都不對 —— 把游標送進輸入框 */
  custom: []
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span class="text-choose mr-0.5 text-xs font-bold">{{ candidates.length }} 個候選</span>

    <button
      v-for="candidate in candidates"
      :key="candidate"
      type="button"
      :aria-pressed="candidate === current"
      class="h-7 rounded-md px-2.5 text-[13px]"
      :class="
        candidate === current
          ? 'border-choose bg-choose-bg text-ink border-[1.5px]'
          : 'border-choose-bg bg-surface text-choose hover:border-choose border'
      "
      @click="emit('choose', candidate)"
    >
      {{ candidate }}
    </button>

    <button
      type="button"
      class="border-field bg-surface text-muted hover:border-muted h-7 rounded-md border border-dashed px-2.5 text-[13px]"
      @click="emit('custom')"
    >
      都不對，自己填
    </button>
  </div>
</template>
