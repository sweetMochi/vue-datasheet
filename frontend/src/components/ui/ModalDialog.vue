<script setup lang="ts">
/**
 * 對話框。用原生的 `<dialog>`，不自己刻。
 *
 * 換到的東西全部免費：焦點鎖在對話框裡、Esc 關閉、背景不可點、
 * 開啟時焦點自動進到第一個可聚焦元素、關閉後焦點回到觸發的按鈕。
 * 用 div + fixed 自己刻的話，上面每一項都要自己實作，而且通常會漏掉一半。
 *
 * 這也呼應「不做無障礙驗收，但語意元素要保留」那條決定（見 README 的「決定不做什麼」）。
 */
import { onMounted, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  /** 危險的動作用紅色標題，例如會丟掉使用者修改的那種 */
  tone?: 'normal' | 'danger'
}>()

const emit = defineEmits<{ close: [] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

function sync() {
  const el = dialog.value
  if (!el) return
  // showModal() 對已經開著的 dialog 會丟例外，所以要先問過
  if (props.open && !el.open) el.showModal()
  if (!props.open && el.open) el.close()
}

/*
 * 掛載時也要對一次。
 *
 * watch 只在「變化」時觸發，而 immediate: true 會在 setup 階段就跑 —— 那時
 * template ref 還是 null。掛載時就 open=true 的情況（例如測試直接這樣渲染）
 * 會靜默地不開啟，所以兩條路都要接。
 */
onMounted(sync)
watch(() => props.open, sync, { flush: 'post' })
</script>

<template>
  <!-- close 事件涵蓋 Esc 與 form method=dialog，兩條路都會走到這裡 -->
  <dialog
    ref="dialog"
    class="bg-surface border-line backdrop:bg-ink/40 m-auto w-120 max-w-[90vw] rounded-lg border p-6 shadow-xl"
    @close="emit('close')"
  >
    <h2 class="border-line mt-8 border-b text-base font-bold" :class="tone === 'danger' ? 'text-danger' : 'text-ink'">
      {{ title }}
    </h2>

    <div class="text-muted mt-2 text-sm leading-relaxed">
      <slot />
    </div>

    <div class="mt-5 flex gap-2">
      <slot name="actions" />
    </div>
  </dialog>
</template>
