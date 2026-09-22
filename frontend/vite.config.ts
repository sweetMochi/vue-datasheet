import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwind from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), tailwind()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // 先預先優化，否則 browser mode 首跑會因為依賴變動重載測試（官方警告 flaky）
  optimizeDeps: {
    include: ['vue', 'vitest-browser-vue'],
  },
  server: {
    host: true, // 容器內要對外監聽，否則主機連不進來
    port: 5173,
  },
  test: {
    // 固定 Vitest 自己的伺服器埠。browser mode 預設從 63315 開始分配，而 Docker
    // Desktop 啟動時會向 Hyper-V 預留一段動態埠（這台機器上是 63295–63494），
    // 兩者相撞就是 listen EACCES，測試連跑都跑不起來 —— 偏偏題目的情境正是
    // docker compose up 與測試都要能用，兩件事會同時發生
    //
    // 設定鍵是 test.api，不是 test.browser.api：埠由 resolveApiServerConfig 讀
    // test.api 決定，browser 底下的同名設定對它沒有作用
    api: { port: 5199 },
    // 用真瀏覽器跑：EventSource 是原生的，樣式走完整 CSS cascade，
    // 而且 es.close() 會真的讓後端收到斷線
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
