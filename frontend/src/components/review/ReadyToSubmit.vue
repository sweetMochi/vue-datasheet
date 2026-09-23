<script setup lang="ts">
/**
 * 全部欄位都處理完之後，清單裡的送出區塊。
 *
 * 右上角的送出鈕一直都在，但使用者的視線在清單上 —— 在「需要你處理」裡確認完
 * 最後一列，那一列一卸載，眼前只剩一片空白。這裡把下一步直接放在視線所在的位置，
 * 行為跟右上角那顆完全一樣（同一個 requestSubmit），不是另一條送出流程。
 *
 * 不用綠色「完成」色：色票刻意只留三種「要你動手」的狀態色（見 style.css），
 * 這裡用中性底加 accent 按鈕，跟右上角的送出鈕同一個樣子。
 */
defineProps<{
  total: number
  /** 使用者動過手的欄位數，跟確認對話框說的是同一個數字 */
  edited: number
}>()

const emit = defineEmits<{ submit: [] }>()
</script>

<template>
  <section
    class="border-line bg-sunken mx-6 mt-6 flex items-center gap-4 rounded-lg border px-5 py-4"
    aria-labelledby="ready-to-submit-title"
  >
    <div class="min-w-0 flex-1">
      <h2 id="ready-to-submit-title" class="text-ink text-sm font-bold">
        {{ total }} 個欄位都確認完了
      </h2>
      <p class="text-muted mt-0.5 text-[13px]">
        其中 {{ edited }} 個你動過手。沒問題的話就可以送出
      </p>
    </div>

    <button
      type="button"
      class="border-accent bg-accent hover:bg-accent-hover h-9 shrink-0 rounded-md border px-4 text-sm font-medium text-white"
      @click="emit('submit')"
    >
      送出
    </button>
  </section>
</template>
