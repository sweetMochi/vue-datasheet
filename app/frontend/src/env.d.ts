
/**
 * 建立宣告檔讓 TypeScript 知道如何解析 .vue 檔案
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
