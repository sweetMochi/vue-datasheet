<script setup lang="ts">
/**
 * 上傳一份檔案，把 SSE 推回來的欄位邊收邊顯示。
 *
 * 這個階段刻意只用原生 HTML 元素、不寫任何樣式：現在要驗證的是
 * 「資料有沒有正確地邊串邊進畫面」，不是版面長什麼樣子。
 * 元件拆分與切版在下一階段，見 ARCHITECTURE.md 的「元件配置」。
 *
 * 編輯、確認、挑候選、送出也留到下一階段 —— store 已經有這些動作，
 * 這裡先只讀不寫。
 */
import { computed, reactive, ref } from 'vue'
import { useReviewStore } from '@/composables/useReviewStore'
import { useExtraction } from '@/composables/useExtraction'
import type { ExtractOptions } from '@/types/extraction'
import type { FieldStatus } from '@/types/field'

const store = useReviewStore()

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

const STATUS_TEXT: Record<FieldStatus, string> = {
  missing: '必填未填',
  multiCandidate: '多個候選',
  lowConfidence: '把握度低',
  ok: '',
}

/**
 * 「重新解析」的確認。
 *
 * 重跑會把使用者改過與確認過的欄位全部丟掉 —— 後端的 id 跨解析不穩定，
 * 沒辦法把舊修改對回新結果（見 useReviewStore.applyField 的註解）。
 * 所以有修改時先問，不自作主張。
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
  <main>
    <h1>檢驗報告欄位審核</h1>

    <!-- 上傳 -->
    <section>
      <h2>一、選擇檔案</h2>
      <p>
        <input type="file" accept="application/pdf,.pdf" @change="pickFile" />
        <button type="button" :disabled="!file || store.isStreaming.value" @click="submitUpload">
          上傳並解析
        </button>
      </p>

      <details>
        <summary>解析參數（手動驗證用）</summary>
        <p>
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
    </section>

    <!-- 進度 -->
    <section>
      <h2>二、解析進度</h2>
      <p>
        狀態：{{ PHASE_TEXT[store.phase.value] ?? store.phase.value }}
        <template v-if="store.document.value">
          ｜檔案：{{ store.document.value.filename }}
        </template>
      </p>

      <p v-if="store.progress.value.stage">
        <progress :value="store.progress.value.percent" max="100" />
        {{ store.progress.value.stage }}（{{ store.progress.value.percent }}%）
      </p>

      <p>
        已收到 {{ received }}
        <template v-if="store.progress.value.total"> ／ {{ store.progress.value.total }} </template>
        個欄位｜待處理 {{ store.pendingCount.value }} 個
      </p>

      <p>
        <button v-if="store.isStreaming.value" type="button" @click="abort()">中止解析</button>
        <button v-if="store.canRetry.value" type="button" @click="requestRetry()">重新解析</button>
      </p>

      <!--
        重新解析會丟掉使用者的修改。這裡是確認，不是提示 ——
        後端重跑回傳的是一份全新的結果，舊的修改對不回去
      -->
      <p v-if="pendingRetryConfirm">
        <strong>重新解析會丟掉你改過的 {{ store.editedIds.value.length }} 個欄位。</strong>
        後端重跑會回傳一份全新的結果，舊的修改沒辦法對回去。
        <button type="button" @click="confirmRetry()">確定，重新解析</button>
        <button type="button" @click="pendingRetryConfirm = false">取消</button>
      </p>

      <!-- 上傳失敗與串流中途失敗是兩件事，文案與可用動作都不同 -->
      <p v-if="uploadError"><strong>上傳失敗：</strong>{{ uploadError }}</p>
      <p v-else-if="store.streamError.value">
        <strong>解析中斷：</strong>{{ store.streamError.value.message }}
        <template v-if="received > 0">（已抽到的 {{ received }} 個欄位保留在下方）</template>
      </p>
    </section>

    <!-- 欄位 -->
    <section>
      <h2>三、抽取結果</h2>
      <p><small>標示 * 的欄位為法規必填</small></p>

      <p v-if="received === 0 && !store.isStreaming.value">尚無資料</p>

      <section v-for="[group, ids] in store.byGroup.value" :key="group">
        <h3>
          {{ group }}
          <template v-if="store.groupCounts.value.get(group)">
            （待處理 {{ store.groupCounts.value.get(group)!.pending }} ／ 共
            {{ store.groupCounts.value.get(group)!.total }}）
          </template>
        </h3>

        <table border="1">
          <thead>
            <tr>
              <th>欄位</th>
              <th>值</th>
              <th>把握度</th>
              <th>頁</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="id in ids" :key="id">
              <td>
                {{ store.fields.get(id)!.label }}
                <abbr v-if="store.fields.get(id)!.required" title="法規必填">*</abbr>
              </td>
              <td>
                <template v-if="store.drafts.get(id)!.value">
                  {{ store.drafts.get(id)!.value }}
                </template>
                <em v-else>無資料</em>
                <!-- 候選先照實列出，挑選的互動留到下一階段 -->
                <ul v-if="store.fields.get(id)!.candidates">
                  <li v-for="candidate in store.fields.get(id)!.candidates" :key="candidate">
                    {{ candidate }}
                  </li>
                </ul>
              </td>
              <td>
                <template v-if="store.fields.get(id)!.confidence !== null">
                  {{ store.fields.get(id)!.confidence!.toFixed(2) }}
                </template>
                <template v-else>—</template>
              </td>
              <td>P{{ store.fields.get(id)!.page }}</td>
              <td>{{ STATUS_TEXT[store.statusOf(id)] }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>
  </main>
</template>
