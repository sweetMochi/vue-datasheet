<script setup lang="ts">
/**
 * 上傳一份檔案，把 SSE 推回來的欄位邊收邊顯示、邊審。
 *
 * 畫面依 phase 分成兩段：idle 是上傳，其餘都走 ReviewLayout。
 * 刻意不是「解析中畫面 → 轉場 → 審核畫面」—— 欄位一到就進清單，
 * 使用者不必對著空白畫面等數十秒（見 ARCHITECTURE.md 的狀態機）。
 *
 * 上傳、中止確認、解析中斷都已切版（Phase 5）。
 */
import { computed, nextTick, reactive, ref } from 'vue'
import ReviewLayout from '@/components/review/ReviewLayout.vue'
import GroupNav, { type GroupEntry } from '@/components/review/GroupNav.vue'
import TriageBar from '@/components/review/TriageBar.vue'
import FieldGroupSection from '@/components/review/FieldGroupSection.vue'
import FieldRow from '@/components/review/FieldRow.vue'
import SubmitGuard from '@/components/review/SubmitGuard.vue'
import FileDropZone from '@/components/upload/FileDropZone.vue'
import AbortConfirmDialog from '@/components/parse/AbortConfirmDialog.vue'
import ParseErrorBanner from '@/components/parse/ParseErrorBanner.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
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
const confirmingAbort = ref(false)

function stopParsing() {
  confirmingAbort.value = false
  abort()
}

const pendingRetryConfirm = ref(false)

function requestRetry() {
  if (retry() === 'needs-confirm') pendingRetryConfirm.value = true
}

function confirmRetry() {
  pendingRetryConfirm.value = false
  retry({ discardEdits: true })
}

/** 從頭來過。document_id 失效時這是唯一的出路，送出完成後也走這裡 */
function restart() {
  store.reset()
  file.value = null
  filters.clear()
  filters.mode.value = 'pending'
}

/**
 * 送出流程：確認 → 輸出 payload → 完成 → 回到 idle 等下一份。
 *
 * 不打任何 API（規格不明確，見 log/08），payload 輸出到 console。
 * 完成後整個回到 idle 而不是停在「已送出」畫面 ——
 * 審核員的動線是一份接一份，停在終點畫面等於每份都要手動按「重來」
 */
const confirmingSubmit = ref(false)
/** 送出當下的快照。reset() 會清掉 store，所以完成對話框只能靠這個 */
const submitted = ref<{ total: number; edited: number } | null>(null)

function requestSubmit() {
  // 送出鈕不灰掉 —— 按下去才說明為什麼不行，並把使用者帶過去
  if (!store.canSubmit.value) {
    const first = store.blockingIssues.value[0]
    if (first) void jumpToField(first.id)
    return
  }
  confirmingSubmit.value = true
}

function doSubmit() {
  const payload = store.submitPayload.value
  confirmingSubmit.value = false
  store.markSubmitted()

  // 後端沒有接收端點，這裡就是這份資料唯一的出口
  console.log(`[送出] ${store.document.value?.filename ?? '未命名'}：${payload.length} 個欄位`)
  console.table(payload)

  submitted.value = {
    total: payload.length,
    edited: payload.filter((f) => f.edited).length,
  }
}

/** 關掉完成對話框 → 清空一切，等下一份文件 */
function finishSubmit() {
  submitted.value = null
  restart()
}

/**
 * 跳到某個欄位。
 *
 * 要先清掉篩選 —— 使用者可能正篩在某個群組，而缺漏的那個不在裡面，
 * 捲過去會找不到元素。必填缺漏一定落在「需要你處理」裡，所以切到那一段
 */
async function jumpToField(id: string) {
  filters.clear()
  filters.mode.value = 'pending'
  await nextTick()
  const el = document.getElementById(`field-${id}`)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el?.focus({ preventScroll: true })
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

    <p class="text-muted mt-1 text-sm">上傳一份檢驗報告，解析完成後逐欄確認與修改</p>

    <div class="mt-6 max-w-2xl">
      <FileDropZone :file="file" @select="file = $event" />

      <button
        type="button"
        class="border-accent bg-accent hover:bg-accent-hover mt-4 h-10 rounded-md border px-5 text-sm font-medium text-white disabled:opacity-40"
        :disabled="!file"
        @click="submitUpload"
      >
        上傳並解析
      </button>
    </div>

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
        @click="confirmingAbort = true"
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

      <!--
        送出鈕永遠可按，不灰掉。灰掉的按鈕不會說為什麼不行、缺哪幾個、該去哪裡
      -->
      <button
        v-if="!store.isStreaming.value"
        type="button"
        class="border-accent bg-accent hover:bg-accent-hover h-9 rounded-md border px-4 text-sm font-medium text-white"
        @click="requestSubmit()"
      >
        送出
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

      <SubmitGuard :issues="store.blockingIssues.value" @jump="jumpToField" />

      <!-- 中止與解析失敗都保留已抽到的欄位，差別只在原因與可用的動作 -->
      <ParseErrorBanner
        v-if="store.streamError.value"
        :error="store.streamError.value"
        :received="received"
        :can-retry="store.canRetry.value"
        @retry="requestRetry()"
        @restart="restart()"
      />

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

  <AbortConfirmDialog
    :open="confirmingAbort"
    :received="received"
    @stop="stopParsing()"
    @keep-waiting="confirmingAbort = false"
  />

  <ModalDialog
    :open="pendingRetryConfirm"
    title="重新解析會丟掉你的修改"
    tone="danger"
    @close="pendingRetryConfirm = false"
  >
    <p>
      你改過或確認過 {{ store.editedIds.value.length }} 個欄位。後端重跑回傳的是一份全新的結果，
      舊的修改沒辦法對回去。
    </p>

    <template #actions>
      <button
        type="button"
        class="border-danger bg-danger h-9 rounded-md border px-4 text-sm font-medium text-white"
        @click="confirmRetry()"
      >
        確定，重新解析
      </button>
      <button
        type="button"
        class="border-field bg-surface text-ink h-9 rounded-md border px-4 text-sm"
        @click="pendingRetryConfirm = false"
      >
        取消
      </button>
    </template>
  </ModalDialog>

  <ModalDialog :open="confirmingSubmit" title="確定要送出嗎？" @close="confirmingSubmit = false">
    <p>
      {{ store.order.value.length }} 個欄位，其中 {{ store.editedIds.value.length }} 個你動過手。
    </p>
    <p class="mt-2">送出後這份文件會關閉，回到上傳畫面等下一份。</p>

    <template #actions>
      <button
        type="button"
        class="border-accent bg-accent hover:bg-accent-hover h-9 rounded-md border px-4 text-sm font-medium text-white"
        @click="doSubmit()"
      >
        確定送出
      </button>
      <button
        type="button"
        class="border-field bg-surface text-ink h-9 rounded-md border px-4 text-sm"
        @click="confirmingSubmit = false"
      >
        再看看
      </button>
    </template>
  </ModalDialog>

  <!--
    標題說「送出完成」，內文說清楚它沒有真的送到哪裡。
    後端的接收端點規格未定（見 log/08），寫成「已成功送達」會是謊報
  -->
  <ModalDialog :open="submitted !== null" title="送出完成" @close="finishSubmit()">
    <p>{{ submitted?.total }} 個欄位已完成審核，其中 {{ submitted?.edited }} 個經過修改。</p>
    <p class="mt-2">
      後端尚未提供接收端點，所以欄位資料<strong class="text-ink">輸出到瀏覽器 console</strong>
      （開發者工具 → Console）。
    </p>

    <template #actions>
      <button
        type="button"
        class="border-accent bg-accent hover:bg-accent-hover h-9 rounded-md border px-4 text-sm font-medium text-white"
        @click="finishSubmit()"
      >
        好，處理下一份
      </button>
    </template>
  </ModalDialog>
</template>
