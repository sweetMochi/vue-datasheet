<script setup lang="ts">
import { useApiStore } from '@/stores/api'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const apiStore = useApiStore()

/** 上傳的文件 */
const file = ref<FileList | null>(null)

/** 測試欄位數量  */
const fieldCount = ref<number>(18)

/** 測試速度倍率 */
const speed = ref<number>(1)

/** 測試於第幾個欄位回傳錯誤 */
const failAt = ref<number>(-1)

/**
 * 使用者上傳文件
 */
async function userUpload() {
  if (!file.value || file.value.length === 0) {
    console.error('No file selected')
    return
  }

  // 上傳文件到後端
  const result = await apiStore.uploadDoc({
    file: file.value[0],
  })

  // 將上傳結果存入全域狀態
  apiStore.docInfo = result

  // 導向抽取頁面
  router.push({
    name: 'Extract',
    params: { id: result.document_id },
  })
}

/**
 * 預覽文件
 * @param event 上傳文件事件
 */
function previewFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  file.value = input.files
}
</script>

<template>
  <div>
    <h1>上傳文件</h1>
    <form @submit.prevent="userUpload">
      <label for="file">選擇文件</label>
      <input id="file" type="file" name="file" required @change="previewFiles" />

      <fieldset>
        <legend>測試參數</legend>

        <label for="field_count">欄位數量</label>
        <input
          id="field_count"
          v-model="fieldCount"
          type="number"
          name="field_count"
          min="1"
          max="300"
        />

        <label for="speed">速度倍率</label>
        <input id="speed" v-model="speed" type="number" name="speed" min="0.1" step="0.1" />

        <label for="fail_at">於第幾個欄位回傳錯誤</label>
        <input id="fail_at" v-model="failAt" type="number" name="fail_at" min="-1" />
        <small>-1 表示不啟用</small>
      </fieldset>

      <button type="submit">上傳</button>
    </form>
  </div>
</template>

<style scoped></style>
