/**
 * 後端位址。
 *
 * 留成環境變數而不是寫死，但理由不是 docker compose 的服務名 —— 發出這些請求的是
 * 使用者的瀏覽器，它跑在主機上、不在 compose 網路裡，解析不到 api 這個名字。
 * 前端就算也進了 compose，這裡仍然是 http://localhost:8000；想用服務名連後端
 * 得改走 Vite proxy 由容器內轉發，而不是改這個常數。
 *
 * 真正會換掉它的情況：8000 被佔走而改了 compose 的 ports、從區域網路上的另一台裝置
 * 連 `vite --host` 開出來的頁面、部署到 localhost 以外的位址。
 */
const BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')

export function apiUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(BASE + path)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

/** 後端回應不是 2xx 時丟這個，讓呼叫端能分辨 HTTP 失敗與串流中途失敗 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
