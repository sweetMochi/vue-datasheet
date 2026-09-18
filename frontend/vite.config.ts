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
