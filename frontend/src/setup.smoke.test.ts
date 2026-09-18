import { it, expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import App from './App.vue'
import './style.css'

// 這支只驗證測試環境本身，不驗任何商業邏輯。
// 下一階段開始寫真正的測試後可以移除。
it('跑在真瀏覽器裡，EventSource 是原生的', () => {
  expect(String(EventSource)).toContain('native code')
})

it('Vue SFC 掛得起來，且 Tailwind 有生效', async () => {
  render(App)
  const main = page.getByRole('main')
  await expect.element(main).toBeVisible()
  expect(getComputedStyle(main.element()).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
})
