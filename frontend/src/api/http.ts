/**
 * 後端位址。
 *
 * 開發時走 Vite proxy 或直接打 localhost:8000；
 * 進 docker compose 之後服務名會變，所以留成環境變數而不是寫死。
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
