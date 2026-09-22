<script setup lang="ts">
/**
 * 欄位的值。
 *
 * **永遠是一個真的 `<input>`**，只是安靜的列把外框與底色拿掉，看起來像純文字。
 *
 * 考慮過「純文字、點一下才變輸入框」，沒採用：那種做法鍵盤到不了，
 * Tab 會直接跳過八成的欄位。外觀一樣，但一個能用鍵盤審完整份文件、一個不能。
 *
 * 這也讓元件不需要自己的 editing 狀態 —— 少一份會跟 store 不同步的東西。
 */
import { useTemplateRef } from 'vue'
import type { ExtractedField, FieldDraft, FieldStatus } from '@/types/field'

defineProps<{
  field: ExtractedField
  draft: FieldDraft
  status: FieldStatus
  inputId: string
}>()

const emit = defineEmits<{ 'update:value': [string] }>()

const input = useTemplateRef<HTMLInputElement>('input')

/** 給「都不對，自己填」用：按下去就把游標送進這個輸入框 */
defineExpose({
  focus: () => input.value?.focus(),
})
</script>

<template>
  <input
    :id="inputId"
    ref="input"
    type="text"
    :value="draft.value"
    :placeholder="field.required ? '文件裡沒抽到，請補上' : ''"
    :aria-invalid="status === 'missing'"
    class="text-ink h-9 w-full rounded-md px-3 text-[15px] outline-none"
    :class="
      status === 'missing'
        ? 'border-danger bg-surface border-[1.5px]'
        : status === 'ok'
          ? 'hover:border-line focus:border-field focus:bg-surface border border-transparent bg-transparent'
          : 'border-field bg-surface border'
    "
    @input="emit('update:value', ($event.target as HTMLInputElement).value)"
  />
</template>
