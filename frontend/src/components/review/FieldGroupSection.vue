<script setup lang="ts">
/**
 * 一個群組的區段標題。
 *
 * 後端是照文件裡出現的順序回傳的，同群組不保證相鄰 —— 分組是前端的責任。
 * 標題黏在捲動區頂端，因為捲到第 180 列時「我現在在哪一組」這件事會消失。
 *
 * 群組名只在這裡出現一次。每一列再印一次群組標籤，120 列就是 120 次噪音
 * （參考圖就是這樣做的，見 README 的介面設計）。
 */
defineProps<{
  group: string
  pending: number
  total: number
}>()
</script>

<template>
  <section>
    <header
      class="bg-ground/95 sticky top-0 z-10 flex items-center gap-3 px-6 pt-4 pb-2 backdrop-blur"
    >
      <h2 class="text-muted pb-0 text-xs font-bold tracking-[0.1em]">{{ group }}</h2>
      <div class="bg-line h-px flex-1" />
      <span class="text-muted font-mono text-xs tabular-nums">
        <template v-if="pending > 0">{{ pending }} 需處理 ／ </template>共 {{ total }}
      </span>
    </header>

    <div class="border-line mx-6 overflow-hidden rounded-md border">
      <slot />
    </div>
  </section>
</template>
