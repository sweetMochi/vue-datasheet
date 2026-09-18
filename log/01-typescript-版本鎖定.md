# 01 · TypeScript 版本鎖定

`2026-09-18` · 人工介入：無（AI 自主實測）

## 問題

`typescript@latest` 現在是 7.0.2（原生 Go 版），要確認能不能用

## 實測

安裝 `vue-tsc@3.3.11` + `typescript@7.0.2`，對一支故意寫錯型別的 SFC 執行 `vue-tsc --noEmit`：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
const n = ref(1)
const bad: string = n.value   // 故意錯
const ok = computed(() => n.value + 1)
</script>
```

結果直接崩潰，連型別檢查都沒開始：

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]:
Package subpath './lib/tsc' is not defined by "exports" in typescript/package.json
    at resolveTscPath (node_modules/vue-tsc/index.js:73:43)
```

TS 7 移除了 vue-tsc 依賴的 `lib/tsc` JS 進入點

降到 `typescript@6.0.3` 重跑：

```
src/Demo.vue(4,7): error TS2322: Type 'number' is not assignable to type 'string'.
```

正常運作，且確實抓到錯誤

## 判斷依據

`vue-tsc` 的 peer 範圍寫的是 `typescript: ">=5.0.0"`，**不會擋你裝 7.x**，所以用 `^` 寫版本號會在某次 `npm i` 之後無聲無息地把型別檢查弄掛

TypeScript 6.x 目前只有 6.0.2 與 6.0.3 兩個穩定版

## 結果

`package.json` 寫成 `"typescript": "~6.0.3"`，鎖 minor
