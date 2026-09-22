/// <reference types="vite/client" />

/**
 * 專案自己的環境變數。
 *
 * 不宣告的話 import.meta.env.VITE_API_BASE 的型別是 any，打錯字不會被 vue-tsc 擋下來。
 * 這裡宣告成必填的 string，因為它的預設值在 frontend/.env，任何一次 build 都一定有值。
 */
interface ImportMetaEnv {
  /** 後端位址，結尾不含斜線。見 api/http.ts */
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
