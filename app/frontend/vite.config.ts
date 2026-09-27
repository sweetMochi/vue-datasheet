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
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
