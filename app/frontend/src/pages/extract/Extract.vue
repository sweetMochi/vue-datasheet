<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useApiStore } from '@/stores/api'
import { CONFIDENCE_THRESHOLD } from '@/stores/api.const'
import { useFilterStore } from '@/stores/filter'
import { FilterType } from '@/stores/filter.type'

import type { SSEExtractType } from '@/stores/api.type'
import type { ExtractFieldList } from './extract.type'

const router = useRouter()
const apiStore = useApiStore()
const filterStore = useFilterStore()

/** 文件名稱 */
const fileName = computed(() => apiStore.docInfo?.filename || '')

/** 當前解析狀態 */
const status = ref<SSEExtractType | null>(null)

/** 已抽取的欄位總數 */
const counterExtracted = computed(() => {
  return list.value.reduce((total, group) => total + group.list.length, 0)
})

/**
 * 需要你處理
 */
const counterNeedConfirmation = computed(() => {
  return list.value.reduce((total, group) => {
    // 每個群組分別計算
    const item = group.list.filter(
      (field) => field.confidence === null || field.confidence < CONFIDENCE_THRESHOLD,
    )

    return total + item.length
  }, 0)
})

/**
 * 判斷是否需要確認
 * @param confidence 信心度
 */
function displayConfirmation(confidence: number | null) {
  if (confidence === null) {
    return '無資料'
  }

  if (confidence < CONFIDENCE_THRESHOLD) {
    return '需要確認'
  }

  return ''
}

/** 當前解析階段 */
const stage = ref<string | null>(null)

/** 解析進度 */
const progress = ref<number>(0)

/** 解析錯誤訊息 */
const errorText = ref<string | null>(null)

/**
 * 當前解析狀態的顯示文字
 */
const displayStatus = computed(() => {
  let view = '等待開始'

  switch (status.value) {
    case 'error':
      view = '解析失敗'
      break
    case 'done':
      view = '解析完成'
      break
    case 'field':
      view = '抽取欄位中'
      break
    case 'stage':
      view = stage.value ?? '解析中'
      break
  }

  return view
})

/** 已抽取的欄位列表 */
const list = ref<ExtractFieldList[]>([])

/** 欄位分組 */
const groups = ref<string[]>([])

/** 當前群組篩選 */
const filterGroup = computed(() => filterStore.group)

/**
 * 根據信心度篩選
 * @param confidence 信心度
 */
function filterConfirmation(confidence: number | null) {
  if (filterStore.confirmation) {
    return confidence === null || confidence < CONFIDENCE_THRESHOLD
  }

  return true
}

/**
 * 使用者主動停止解析
 */
function userCancel(): void {
  status.value = 'error'
  errorText.value = '使用者取消解析'
  apiStore.cancelExtract()
}

/**
 * 使用者送出解析結果
 */
function userSubmit(): void {
  console.log('User submitted the extraction result')
}

/**
 * 使用者篩選欄位
 * @param type 篩選類型
 * @param value 篩選值
 */
function userFilter(type: FilterType, value: string | boolean | null) {
  switch (type) {
    case 'group':
      filterStore.setGroup(value as string)
      break

    case 'confirmation':
      filterStore.setConfirmation(value as boolean)
      break

    case 'search':
      filterStore.setSearch(value as string)
      break
  }
}

/**
 * 使用者搜尋
 * @param event 輸入事件
 */
function userSearch(event: Event): void {
  const input = event.target as HTMLInputElement
  userFilter('search', input.value)
}

/**
 * 使用者重新嘗試解析
 */
async function userRetry(): Promise<void> {
  if (window.confirm('確定要重新解析嗎？')) {
    status.value = null
    stage.value = null
    progress.value = 0
    errorText.value = null
    list.value = []
    groups.value = []
    await extractDoc(apiStore.docInfo!.document_id)
  }
}

/**
 * 解析文件
 * @param id 文件 ID
 */
async function extractDoc(id: string) {
  await apiStore
    .extractDoc(id, (e) => {
      console.log('SSE event:', e)
      status.value = e.event

      switch (e.event) {
        case 'stage':
          stage.value = e.data.stage
          progress.value = e.data.progress
          break

        case 'field': {
          // 找到對應的群組
          const target = list.value.find((field) => field.group === e.data.group)

          // 如果已經有群組了
          if (target) {
            // 加入群組
            target.list.push(e.data)
            // 依照頁碼排序
            target.list.sort((a, b) => a.page - b.page)
          }
          // 如果群組不存在
          else {
            // 則建立新的群組並加入欄位資料
            list.value.push({
              group: e.data.group,
              list: [e.data],
            })

            // 增加到群組清單
            groups.value.push(e.data.group)
          }

          break
        }

        case 'done':
          progress.value = 100
          break
      }
    })
    .catch((error) => {
      if (typeof error === 'string') {
        errorText.value = error
      } else if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorText.value = '解析被中止'
        } else {
          errorText.value = error.message
        }
      }
      status.value = 'error'
      console.error('Extraction error:', error)
    })
}

onMounted(async () => {
  // 這邊應該要取得 router 參數，例如文件 ID
  // 例如 const id = router.currentRoute.value.params.id
  // 然後打後端再取得文件處理狀態

  // 由於沒有後端查詢方法
  // 這裡暫時直接使用本地存儲的文件資訊
  // 如果沒有儲存的文件資訊
  if (!apiStore.docInfo) {
    router.push('/')
    return
  }

  await extractDoc(apiStore.docInfo.document_id)
})

onUnmounted(() => {
  // 使用者離開頁面後中斷 SSE 串流
  apiStore.cancelExtract()
})
</script>

<template>
  <div>
    <header>
      <h1>{{ fileName }}</h1>
      <p>{{ displayStatus }}</p>
      <progress max="100" :value="progress"></progress>
      <p>已抽取 {{ counterExtracted }} 個欄位</p>
      <button type="button" @click="userCancel">終止解析</button>
      <button type="submit" form="datasheet">送出</button>
    </header>

    <aside>
      <h2>需要你處理</h2>
      <p>{{ counterNeedConfirmation }}</p>
      <h2>欄位分組</h2>
      <ul>
        <li @click="userFilter('group', null)">全部</li>
        <li v-for="group in groups" :key="group" @click="userFilter('group', group)">
          {{ group }}
        </li>
      </ul>
    </aside>

    <section>
      <!-- 篩選選項 - 開始 -->
      <div>
        <h2>篩選欄位</h2>
        <div>
          <label>
            <input
              type="radio"
              name="filter-switch"
              value="needConfirmation"
              checked
              @click="userFilter('confirmation', true)"
            />
            需要你確認
          </label>
          <label>
            <input
              type="radio"
              name="filter-switch"
              value="all"
              @click="userFilter('confirmation', false)"
            />
            全部
          </label>
        </div>

        <div>
          <input
            type="text"
            name="filter-input"
            placeholder="輸入欄位名稱或輸入值"
            @input="userSearch($event)"
          />
        </div>
      </div>
      <!-- 篩選選項 - 結束 -->

      <!-- 錯誤提醒 - 開始 -->
      <div v-if="status === 'error'">
        <h2>解析失敗</h2>
        <p>{{ errorText }}</p>
        <button type="button" @click="userRetry">重新解析</button>
      </div>
      <!-- 錯誤提醒 - 結束 -->

      <form id="datasheet" @submit.prevent="userSubmit">
        <section>
          <h2>基本資料</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">欄位</th>
                <th scope="col">群組</th>
                <th scope="col">值</th>
                <th scope="col">把握度</th>
                <th scope="col">頁碼</th>
                <th scope="col">確認</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in list" :key="`list-${group.group}`">
                <tr v-for="field in group.list" :key="`group-${field.id}`">
                  <template v-if="!filterGroup || filterGroup === group.group">
                    <template v-if="filterConfirmation(field.confidence)">
                      <th scope="row">
                        <label :for="`field-${field.id}`">{{ field.label }}</label>
                        <small v-if="field.required">必填</small>
                      </th>
                      <td>{{ group.group }}</td>
                      <td>
                        <!-- 選擇答案區塊 - 開始 -->
                        <template v-if="field.candidates?.length">
                          <fieldset>
                            <legend>候選答案</legend>
                            <label
                              v-for="(candidate, index) in field.candidates"
                              :key="`candidate-${field.id}-${index}`"
                            >
                              <input
                                type="radio"
                                :name="`field-${field.id}-select`"
                                :value="candidate"
                                :checked="index === 0"
                              />
                              {{ candidate }}
                            </label>
                            <label>
                              <input type="radio" :name="`field-${field.id}-select`" value="" />
                              其他：
                              <input
                                :id="`field-${field.id}`"
                                type="text"
                                :name="`field-${field.id}`"
                              />
                            </label>
                          </fieldset>
                        </template>
                        <!-- 選擇答案區塊 - 結束 -->
                        <!-- 一般輸入區塊 - 開始 -->
                        <template v-else>
                          <input
                            :id="`field-${field.id}`"
                            type="text"
                            :name="`field-${field.id}`"
                            :value="field.value"
                            :required="field.required"
                          />
                        </template>
                        <!-- 一般輸入區塊 - 結束 -->
                      </td>
                      <td>
                        {{ displayConfirmation(field.confidence) }}
                      </td>
                      <td>{{ field.page || '無資料' }}</td>
                      <td><input type="checkbox" :name="`confirmed-${field.id}`" /></td>
                    </template>
                  </template>
                </tr>
              </template>
            </tbody>
          </table>
        </section>
      </form>
    </section>
  </div>
</template>

<style scoped></style>
