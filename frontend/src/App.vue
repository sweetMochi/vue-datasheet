<script setup lang="ts">
/**
 * 上傳一份檔案，把 SSE 推回來的欄位邊收邊顯示、邊審。
 *
 * 畫面依 phase 分成兩段：idle 是上傳，其餘都走 ReviewLayout。
 * 刻意不是「解析中畫面 → 轉場 → 審核畫面」—— 欄位一到就進清單，
 * 使用者不必對著空白畫面等數十秒（見 ARCHITECTURE.md 的狀態機）。
 *
 * 還沒做：送出（Phase 4）、上傳與例外狀態的切版（Phase 5）。
 */
import { computed, reactive, ref } from 'vue'
import ReviewLayout from '@/components/review/ReviewLayout.vue'
import GroupNav, { type GroupEntry } from '@/components/review/GroupNav.vue'
import TriageBar from '@/components/review/TriageBar.vue'
import FieldGroupSection from '@/components/review/FieldGroupSection.vue'
import FieldRow from '@/components/review/FieldRow.vue'
import { useReviewStore } from '@/composables/useReviewStore'
import { useExtraction } from '@/composables/useExtraction'
import { useFieldFilters } from '@/composables/useFieldFilters'
import type { ExtractOptions } from '@/types/extraction'

const store = useReviewStore()
const filters = useFieldFilters(store)

/**
 * 解析參數。
 *
 * transport 是在每次 listen() 當下才讀這個物件，所以做成 reactive 就能讓
 * 輸入框的值在「重新解析」時一併生效，不必重新建立 useExtraction。
 * 用途是手動驗證 300 欄位、加速、中途失敗這三種情況。
 */
const extractOptions = reactive<ExtractOptions>({ fieldCount: 60, speed: 1, failAt: -1 })

const { uploadError, start, retry, abort } = useExtraction(store, { extract: extractOptions })

const file = ref<File | null>(null)

function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

function submitUpload() {
  if (file.value) void start(file.value)
}

/** 收到的欄位數。串流途中它會小於 progress.total，這個差距就是進度本身 */
const received = computed(() => store.order.value.length)

/**
 * 左欄的群組計數用「全部欄位」的數字，不是篩選後的。
 * 側欄要回答的是「還有哪幾組沒處理完」，跟著篩選變動的話就答不了。
 */
const groupEntries = computed<GroupEntry[]>(() =>
  [...store.groupCounts.value].map(([name, count]) => ({ name, ...count })),
)

/**
 * 「重新解析」的確認。
 *
 * 重跑會把使用者改過與確認過的欄位全部丟掉 —— 後端的 id 跨解析不穩定，
 * 沒辦法把舊修改對回新結果（見 useReviewStore.applyField 的註解）。
 */
const pendingRetryConfirm = ref(false)

function requestRetry() {
  if (retry() === 'needs-confirm') pendingRetryConfirm.value = true
}

function confirmRetry() {
  pendingRetryConfirm.value = false
  retry({ discardEdits: true })
}

const PHASE_TEXT: Record<string, string> = {
  idle: '尚未開始',
  uploading: '上傳中',
  parsing: '解析中',
  review: '解析完成',
  aborted: '已中止',
  failed: '解析失敗',
  submitted: '已送出',
}
</script>

<template>
  <!-- 上傳前。FileDropZone 的切版排在 Phase 5，這裡先用原生元素 -->
  <main v-if="store.phase.value === 'idle'" class="p-6">
    <h1 class="text-ink text-2xl font-bold">檢驗報告欄位審核</h1>

    <p class="mt-4">
      <!--
        刻意不設 accept：題目寫明「隨便丟什麼檔案都可以，後端不會真的去解析內容」，
        而且真實的檢驗報告很多是掃描的圖片，限死 PDF 反而不符情境
      -->
      <input type="file" @change="pickFile" />
      <button
        type="button"
        class="border-accent bg-accent hover:bg-accent-hover ml-2 h-9 rounded-md border px-4 text-sm font-medium text-white disabled:opacity-40"
        :disabled="!file"
        @click="submitUpload"
      >
        上傳並解析
      </button>
    </p>

    <p v-if="uploadError" class="text-danger mt-3 text-sm">
      <strong>上傳失敗：</strong>{{ uploadError }}
    </p>

    <details class="mt-6 text-sm">
      <summary class="text-muted cursor-pointer">解析參數（手動驗證用）</summary>
      <p class="mt-2 flex gap-4">
        <label>
          欄位數
          <input v-model.number="extractOptions.fieldCount" type="number" min="1" max="300" />
        </label>
        <label>
          速度倍率
          <input v-model.number="extractOptions.speed" type="number" min="0.1" step="0.1" />
        </label>
        <label>
          於第幾個欄位失敗（-1 為不啟用）
          <input v-model.number="extractOptions.failAt" type="number" min="-1" />
        </label>
      </p>
    </details>
  </main>

  <!-- 解析中與審核共用同一個畫面 -->
  <ReviewLayout v-else>
    <template #header>
      <span class="text-ink text-[15px] font-bold">{{ store.document.value?.filename }}</span>
      <span class="text-muted text-[13px]">
        {{ PHASE_TEXT[store.phase.value] ?? store.phase.value }}
        <template v-if="store.progress.value.stage"> · {{ store.progress.value.stage }}</template>
      </span>

      <div class="flex-1" />

      <span class="text-muted font-mono text-[13px] tabular-nums">
        已收到 {{ received }}
        <template v-if="store.progress.value.total"> / {{ store.progress.value.total }}</template>
      </span>

      <button
        v-if="store.isStreaming.value"
        type="button"
        class="border-field bg-surface text-ink hover:border-muted h-9 rounded-md border px-3.5 text-sm"
        @click="abort()"
      >
        中止解析
      </button>
      <button
        v-if="store.canRetry.value"
        type="button"
        class="border-field bg-surface text-ink hover:border-muted h-9 rounded-md border px-3.5 text-sm"
        @click="requestRetry()"
      >
        重新解析
      </button>
    </template>

    <template #progress>
      <div
        class="bg-accent h-0.5 transition-[width] duration-300"
        :style="{ width: `${store.progress.value.percent}%` }"
      />
    </template>

    <template #rail>
      <GroupNav
        :pending-count="store.pendingCount.value"
        :groups="groupEntries"
        :active="filters.group.value"
        @select="filters.group.value = $event"
      />
    </template>

    <template #main>
      <TriageBar
        v-model:mode="filters.mode.value"
        v-model:keyword="filters.keyword.value"
        :pending-count="store.pendingCount.value"
        :total-count="received"
        :visible-count="filters.visibleCount.value"
      />

      <!-- 中止與解析失敗都保留已抽到的欄位，差別只在原因與可用的動作 -->
      <div
        v-if="store.streamError.value"
        class="bg-danger-bg border-danger/20 text-danger flex items-center gap-3 border-b px-6 py-3 text-sm"
      >
        <strong>解析中斷</strong>
        <span>{{ store.streamError.value.message }}</span>
        <template v-if="received > 0">
          <span class="text-muted">已抽到的 {{ received }} 個欄位留在下方</span>
        </template>
      </div>

      <div
        v-if="pendingRetryConfirm"
        class="bg-danger-bg border-danger/20 flex items-center gap-3 border-b px-6 py-3 text-sm"
      >
        <strong class="text-danger">
          重新解析會丟掉你改過的 {{ store.editedIds.value.length }} 個欄位
        </strong>
        <span class="text-muted">後端重跑回傳的是一份全新的結果，舊的修改對不回去</span>
        <div class="flex-1" />
        <button
          type="button"
          class="border-danger bg-danger h-8 rounded-md border px-3 text-[13px] font-medium text-white"
          @click="confirmRetry()"
        >
          確定，重新解析
        </button>
        <button
          type="button"
          class="border-field bg-surface text-ink h-8 rounded-md border px-3 text-[13px]"
          @click="pendingRetryConfirm = false"
        >
          取消
        </button>
      </div>

      <div class="flex-1 overflow-y-auto pb-8">
        <p v-if="received === 0 && store.isStreaming.value" class="text-muted px-6 py-6 text-sm">
          解析中，第一批欄位馬上就到⋯⋯
        </p>

        <!-- 「篩選後沒中」跟「還沒有資料」是兩件事，文案不能一樣 -->
        <p v-else-if="filters.isEmptyResult.value" class="text-muted px-6 py-6 text-sm">
          沒有符合條件的欄位。
          <button type="button" class="text-accent underline" @click="filters.clear()">
            清掉篩選
          </button>
        </p>

        <p v-else-if="received === 0" class="text-muted px-6 py-6 text-sm">尚無資料</p>

        <FieldGroupSection
          v-for="section in filters.sections.value"
          :key="section.group"
          :group="section.group"
          :pending="store.groupCounts.value.get(section.group)?.pending ?? 0"
          :total="store.groupCounts.value.get(section.group)?.total ?? 0"
        >
          <FieldRow
            v-for="id in section.ids"
            :key="id"
            :field="store.fields.get(id)!"
            :draft="store.drafts.get(id)!"
            :status="store.statusOf(id)"
            @update:value="store.setValue(id, $event)"
            @confirm="store.confirm(id)"
            @choose="store.chooseCandidate(id, $event)"
            @reset="store.resetField(id)"
          />
        </FieldGroupSection>

        <p v-if="store.isStreaming.value && received > 0" class="text-muted px-6 py-5 text-sm">
          <span class="bg-accent mr-2 inline-block h-2 w-2 rounded-full" />
          解析中，新抽到的欄位會直接插進所屬群組
        </p>
      </div>
    </template>
  </ReviewLayout>
</template>
