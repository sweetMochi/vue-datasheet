<script setup lang="ts">
/**
 * 擋住送出的說明帶。
 *
 * **送出鈕不灰掉。** 灰掉的按鈕不會告訴使用者三件事：為什麼不行、缺哪幾個、
 * 點一下要去哪裡。這條帶子把三件事都說了，按鈕則永遠可按 ——
 * 按下去如果還不能送，就把使用者帶到第一個缺漏的欄位。
 *
 * 只列法規必填且沒有值的欄位。低把握度、多候選都不擋送出 ——
 * 使用者沒有義務逐一確認上百個高把握度欄位，法規在意的只有那三個
 * （見 useReviewStore 的 blockingIssues）。
 */
import type { ExtractedField } from '@/types/field'

defineProps<{
  issues: ExtractedField[]
}>()

const emit = defineEmits<{ jump: [string] }>()
</script>

<template>
  <div
    v-if="issues.length > 0"
    class="bg-danger-bg border-danger/20 flex shrink-0 items-center gap-3 border-b px-6 py-3"
    role="status"
  >
    <strong class="text-danger shrink-0 text-sm font-bold">還不能送出</strong>
    <span class="text-danger/90 min-w-0 truncate text-sm">
      {{ issues.length }} 個法規必填欄位還沒填：{{ issues.map((f) => f.label).join('、') }}
    </span>

    <div class="flex-1" />

    <button
      type="button"
      class="border-danger bg-danger h-8 shrink-0 rounded-md border px-3 text-[13px] font-medium text-white"
      @click="emit('jump', issues[0]!.id)"
    >
      跳到第一個
    </button>
  </div>
</template>
