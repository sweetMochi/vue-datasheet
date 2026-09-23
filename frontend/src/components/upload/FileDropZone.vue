<script setup lang="ts">
/**
 * 上傳區。
 *
 * 外層是 `<label>`，裡面包一個**真的** `<input type="file">`（只是視覺上藏起來）。
 * 這個組合讓三種操作都成立：點整塊區域會開檔案選擇器（label 的原生行為）、
 * Tab 進得來、拖放也可以。自己用 div 做的話，鍵盤使用者就完全沒有路可走。
 *
 * 拖放用深度計數而不是單純的 dragenter/dragleave：滑鼠經過子元素時
 * 會先觸發子元素的 enter 再觸發父元素的 leave，只看事件會讓外框一直閃。
 */
import { computed, ref } from 'vue'

const props = defineProps<{
  file: File | null
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [File | null] }>()

const depth = ref(0)
const dragging = computed(() => depth.value > 0 && !props.disabled)

function onDrop(event: DragEvent) {
  depth.value = 0
  if (props.disabled) return
  emit('select', event.dataTransfer?.files?.[0] ?? null)
}

function onPick(event: Event) {
  emit('select', (event.target as HTMLInputElement).files?.[0] ?? null)
}
</script>

<template>
  <label
    class="focus-within:border-accent flex cursor-pointer flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed px-6 py-10 text-center transition-colors"
    :class="dragging ? 'border-accent bg-accent/5' : 'border-field bg-sunken hover:border-muted'"
    @dragenter.prevent="depth++"
    @dragover.prevent
    @dragleave.prevent="depth--"
    @drop.prevent="onDrop"
  >
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="text-accent"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>

    <span class="text-ink text-[15px] font-medium">
      <template v-if="file">{{ file.name }}</template>
      <template v-else>把檔案拖進來，或點一下選擇</template>
    </span>

    <span class="text-muted text-xs">
      <!-- 題目寫明「隨便丟什麼檔案都可以，後端不會真的去解析內容」 -->
      PDF、圖片皆可 · 解析約需十幾秒到數十秒
    </span>

    <input type="file" class="sr-only" :disabled="disabled" @change="onPick" />
  </label>
</template>
