<script setup lang="ts">
/**
 * 一列欄位。
 *
 * **這是全專案最吃效能的元件**，會被實體化上百次，所以有三條硬規則：
 *
 * 1. 不呼叫 useReviewStore() —— 所有資料由 props 傳入
 * 2. 沒有 watch、沒有自己的衍生 computed —— 父層算好再傳
 * 3. 事件用 emit 往上拋
 *
 * 這不是潔癖，是量測前提：log/07 的數字（300 列在 4 倍 CPU 降速下按鍵 p95 3.8ms）
 * 就是在這個前提下量到的。改成 300 個元件各自訂閱 store，那些數字不成立，
 * 「不做虛擬捲動」的結論也跟著不成立。
 *
 * 版面是九樣資訊的三層分配（見 README 的介面設計）：
 * 色條只說「要不要我處理」，值是主角佔最大寬度，頁碼壓到最小最淡。
 */
import { useTemplateRef } from 'vue'
import ConfidenceMark from './ConfidenceMark.vue'
import FieldValueEditor from './FieldValueEditor.vue'
import CandidatePicker from './CandidatePicker.vue'
import { STATUS_VIEW } from './fieldStatusView'
import type { ExtractedField, FieldDraft, FieldStatus } from '@/types/field'

const props = defineProps<{
  field: ExtractedField
  draft: FieldDraft
  status: FieldStatus
}>()

const emit = defineEmits<{
  'update:value': [string]
  confirm: []
  choose: [string]
  reset: []
}>()

const editor = useTemplateRef<InstanceType<typeof FieldValueEditor>>('editor')
</script>

<template>
  <div class="border-line-faint bg-surface flex border-b">
    <ConfidenceMark :status="props.status" :confidence="props.field.confidence" />

    <div class="flex flex-1 gap-4 py-2.5 pr-6 pl-[17px]">
      <!-- 標籤用次級灰、值用近黑：反過來會讓人先讀到標籤 -->
      <label
        :for="`field-${props.field.id}`"
        class="w-40 shrink-0 pt-2 text-sm"
        :class="props.status === 'ok' ? 'text-muted' : 'text-ink font-medium'"
      >
        {{ props.field.label }}
        <abbr v-if="props.field.required" title="法規必填" class="text-danger no-underline">*</abbr>
      </label>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <FieldValueEditor
          ref="editor"
          :field="props.field"
          :draft="props.draft"
          :status="props.status"
          :input-id="`field-${props.field.id}`"
          @update:value="emit('update:value', $event)"
        />

        <CandidatePicker
          v-if="props.field.candidates"
          :candidates="props.field.candidates"
          :current="props.draft.value"
          @choose="emit('choose', $event)"
          @custom="editor?.focus()"
        />
      </div>

      <!--
        狀態標註與動作。安靜的列這一格是空的。

        用 flex-wrap 橫排而不是直接堆成一欄：堆起來會把有確認鈕的列撐高一截，
        而整份設計的前提是能一眼掃過幾十列，列高不一致會破壞那個節奏
      -->
      <div class="flex w-[148px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 pt-2">
        <span
          v-if="STATUS_VIEW[props.status].label"
          class="text-xs font-bold"
          :class="STATUS_VIEW[props.status].tone"
        >
          {{ STATUS_VIEW[props.status].label }}
        </span>

        <button
          v-if="STATUS_VIEW[props.status].confirmable"
          type="button"
          class="border-accent/40 bg-surface text-accent hover:border-accent h-8 rounded-md border px-3.5 text-[13px] font-medium"
          @click="emit('confirm')"
        >
          確認
        </button>

        <!--
          只有真的改過才出現。O(1) 的比較，不是掃過 store 的衍生值，
          所以放在樣板裡不違反上面第 2 條
        -->
        <button
          v-if="props.draft.value !== props.field.value"
          type="button"
          class="text-muted hover:text-ink text-xs underline underline-offset-2"
          @click="emit('reset')"
        >
          重設
        </button>
      </div>

      <span class="text-muted w-7 shrink-0 pt-2 text-right font-mono text-xs tabular-nums">
        P{{ props.field.page }}
      </span>
    </div>
  </div>
</template>
