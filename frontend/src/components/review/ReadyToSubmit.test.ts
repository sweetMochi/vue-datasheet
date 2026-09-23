import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import ReadyToSubmit from './ReadyToSubmit.vue'
import '@/style.css'

describe('ReadyToSubmit', () => {
  it('說出確認了幾個、動過幾個，跟確認對話框的數字一致', async () => {
    const screen = await render(ReadyToSubmit, { props: { total: 60, edited: 4 } })

    expect(screen.container.textContent).toContain('60 個欄位都確認完了')
    expect(screen.container.textContent).toContain('其中 4 個你動過手')
  })

  /** 行為跟右上角的送出鈕一樣：只往上拋，確認對話框由父層開 */
  it('按下送出只拋 submit，不自己送', async () => {
    const screen = await render(ReadyToSubmit, { props: { total: 60, edited: 4 } })

    await screen.getByRole('button', { name: '送出' }).click()

    expect(screen.emitted('submit')).toHaveLength(1)
  })
})
