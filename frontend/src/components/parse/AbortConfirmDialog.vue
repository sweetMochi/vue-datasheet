<script setup lang="ts">
/**
 * 「中止解析」的確認。
 *
 * **`received` 必須是活的數字，不能是開啟對話框當下的快照。**
 *
 * 對話框開著的那幾秒串流仍然在跑 —— abort() 是按下「停止」才呼叫的。
 * 寫死快照會變成謊言：畫面上說 46，使用者按下去實際留下的可能是 52。
 * 數字在對話框裡往上跳反而是對的，它正好說明「你還在等的東西還在進來」。
 *
 * 那為什麼不乾脆「開啟對話框就先暫停」？因為後端的 SSE 不送 id:，沒有續傳。
 * 一旦斷線，「繼續等」就只能整份重跑，已經抽到的全部重來。
 * 保留對話框 ＋ 活的數字是唯一自洽的選項（見 REVIEW.md 的中止流程）。
 */
import ModalDialog from '@/components/ui/ModalDialog.vue'

defineProps<{
  open: boolean
  /** 已經抽到幾個欄位。綁 store.order.length，不要在開啟時複製一份 */
  received: number
}>()

const emit = defineEmits<{ stop: []; keepWaiting: [] }>()
</script>

<template>
  <ModalDialog :open="open" title="要停在這裡嗎？" @close="emit('keepWaiting')">
    <p>
      已經抽到的
      <span
        class="bg-danger-bg text-ink rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums"
      >
        {{ received }}
      </span>
      個欄位會留著繼續審，後面沒跑完的就不會有了。
    </p>
    <p class="mt-2">中止也會讓後端停止運算，不只是這邊不看了。</p>

    <template #actions>
      <button
        type="button"
        class="border-ink bg-ink h-9 rounded-md border px-4 text-sm font-medium text-white"
        @click="emit('stop')"
      >
        停止，保留已抽到的
      </button>
      <button
        type="button"
        class="border-field bg-surface text-ink h-9 rounded-md border px-4 text-sm"
        @click="emit('keepWaiting')"
      >
        繼續等
      </button>
    </template>
  </ModalDialog>
</template>
