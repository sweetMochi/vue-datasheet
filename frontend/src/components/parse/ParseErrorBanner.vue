<script setup lang="ts">
/**
 * 解析中斷的說明帶。
 *
 * 已經抽到的欄位一律留著 —— 那是「跑到一半掛掉」與「重來一次」的差別。
 * 使用者可能已經審了二十個，清空等於把那些工作丟掉。
 *
 * **可不可以重跑要看錯誤碼。** document_id 失效（後端重啟過）時重跑一百次都是 404，
 * 這時候該給的是「重新上傳」而不是「重新解析」。這個分辨能力正是傳輸層從
 * EventSource 換成 fetch 換到的東西 —— EventSource 讀不到 HTTP 狀態碼。
 */
import type { ExtractionErrorEvent } from '@/types/extraction'

defineProps<{
  error: ExtractionErrorEvent
  received: number
  /** 來自 store.canRetry：DOCUMENT_EXPIRED 時為 false */
  canRetry: boolean
}>()

const emit = defineEmits<{ retry: []; restart: [] }>()
</script>

<template>
  <div
    class="bg-danger-bg border-danger/20 flex shrink-0 items-start gap-3 border-b px-6 py-3"
    role="alert"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="text-danger mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path
        d="m10.6 3.6-8 14A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.4l-8-14a1.6 1.6 0 0 0-2.8 0Z"
      />
    </svg>

    <div class="min-w-0 flex-1">
      <div class="text-danger text-sm font-bold">
        <template v-if="received > 0">解析在第 {{ received }} 個欄位中斷了</template>
        <template v-else>解析沒有開始</template>
      </div>
      <div class="text-danger/90 mt-0.5 text-[13px]">
        {{ error.message }}（{{ error.code }}）
        <template v-if="received > 0"> · 已經抽到的欄位都還在，你可以先審，也可以重跑 </template>
      </div>
    </div>

    <button
      v-if="canRetry"
      type="button"
      class="border-danger bg-danger h-8 shrink-0 rounded-md border px-3 text-[13px] font-medium text-white"
      @click="emit('retry')"
    >
      重新解析
    </button>
    <button
      v-else
      type="button"
      class="border-danger bg-danger h-8 shrink-0 rounded-md border px-3 text-[13px] font-medium text-white"
      @click="emit('restart')"
    >
      重新上傳
    </button>
  </div>
</template>
