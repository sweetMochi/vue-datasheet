/**
 * 後端位址。build-time 的靜態值，Vite 打包時字面替換進 bundle。
 *
 * 預設值在 frontend/.env，個人覆寫寫 .env.local。
 * 為什麼是環境變數、為什麼不能填 compose 的服務名，見
 * ARCHITECTURE.md 的「src/api/http.ts — 位址與錯誤型別」。
 */
const BASE = import.meta.env.VITE_API_BASE

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
