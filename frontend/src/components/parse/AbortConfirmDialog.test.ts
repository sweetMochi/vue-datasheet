import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import AbortConfirmDialog from './AbortConfirmDialog.vue'
import ParseErrorBanner from './ParseErrorBanner.vue'
import FileDropZone from '@/components/upload/FileDropZone.vue'
import '@/style.css'

describe('中止確認', () => {
  /**
   * 這是整個對話框存在的理由，也是最容易被寫成 bug 的一條。
   *
   * abort() 是按下「停止」才呼叫的，所以對話框開著的那幾秒串流仍在跑。
   * 如果數字是開啟當下複製的一份快照，畫面上說 46、使用者按下去實際留下 52，
   * 那句話就變成謊言。
   */
  it('欄位數是活的，串流繼續它就要跟著跳', async () => {
    const screen = await render(AbortConfirmDialog, {
      props: { open: true, received: 46 },
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(document.body.textContent).toContain('46')

    // 對話框還開著，後端又送來六個
    await screen.rerender({ received: 52 })

    expect(document.body.textContent).toContain('52')
    expect(document.body.textContent).not.toContain('46')
  })

  it('說清楚已抽到的會留著，不是放棄全部', async () => {
    await render(AbortConfirmDialog, { props: { open: true, received: 46 } })
    await new Promise((r) => setTimeout(r, 30))

    expect(document.body.textContent).toContain('留著繼續審')
    // 中止不只是前端不看了，後端也會停
    expect(document.body.textContent).toContain('後端停止運算')
  })

  it('兩條路都給得出來：停止與繼續等', async () => {
    const screen = await render(AbortConfirmDialog, { props: { open: true, received: 46 } })
    await new Promise((r) => setTimeout(r, 30))

    await screen.getByRole('button', { name: '繼續等' }).click()
    expect(screen.emitted('keepWaiting')).toHaveLength(1)

    await screen.getByRole('button', { name: '停止，保留已抽到的' }).click()
    expect(screen.emitted('stop')).toHaveLength(1)
  })
})

describe('解析中斷', () => {
  const timeout = { message: '解析服務暫時無法回應', code: 'UPSTREAM_TIMEOUT' }
  const expired = {
    message: '這份文件在後端已失效（服務重啟過），請重新上傳',
    code: 'DOCUMENT_EXPIRED',
  }

  it('可重試時給「重新解析」', async () => {
    const screen = await render(ParseErrorBanner, {
      props: { error: timeout, received: 46, canRetry: true },
    })

    await expect.element(screen.getByRole('button', { name: '重新解析' })).toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: '重新上傳' })).not.toBeInTheDocument()
    expect(screen.container.textContent).toContain('第 46 個欄位中斷')
    expect(screen.container.textContent).toContain('已經抽到的欄位都還在')
  })

  /**
   * document_id 失效時重跑一百次都是 404。這個分辨能力正是傳輸層
   * 從 EventSource 換成 fetch 換到的東西 —— EventSource 讀不到狀態碼。
   */
  it('document_id 失效時改成「重新上傳」，不給一條走不通的路', async () => {
    const screen = await render(ParseErrorBanner, {
      props: { error: expired, received: 46, canRetry: false },
    })

    await expect.element(screen.getByRole('button', { name: '重新上傳' })).toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: '重新解析' })).not.toBeInTheDocument()

    await screen.getByRole('button', { name: '重新上傳' }).click()
    expect(screen.emitted('restart')).toHaveLength(1)
  })

  it('一個欄位都沒抽到時不說「在第 0 個中斷」', async () => {
    const screen = await render(ParseErrorBanner, {
      props: { error: timeout, received: 0, canRetry: true },
    })

    expect(screen.container.textContent).toContain('解析沒有開始')
    expect(screen.container.textContent).not.toContain('第 0 個')
  })
})

describe('上傳區', () => {
  /**
   * 外層 label 包一個真的 input：點整塊開檔案選擇器、Tab 進得來、拖放也可以。
   * 用 div 做的話鍵盤使用者完全沒有路可走。
   */
  it('裡面是真的 file input，不是 div', async () => {
    const screen = await render(FileDropZone, { props: { file: null } })

    const input = screen.container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    // sr-only 是視覺隱藏，不是 display:none —— 還進得了 Tab 順序
    expect(input!.className).toContain('sr-only')
    expect(input!.getAttribute('hidden')).toBeNull()
  })

  it('選過檔案之後顯示檔名', async () => {
    const screen = await render(FileDropZone, {
      props: { file: new File(['x'], '檢驗報告_範例.pdf', { type: 'application/pdf' }) },
    })

    expect(screen.container.textContent).toContain('檢驗報告_範例.pdf')
  })

  it('拖放會把檔案往上拋', async () => {
    const screen = await render(FileDropZone, { props: { file: null } })

    const transfer = new DataTransfer()
    transfer.items.add(new File(['x'], 'dropped.pdf', { type: 'application/pdf' }))
    const label = screen.container.querySelector('label')!
    label.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))

    const emitted = screen.emitted('select')?.at(-1) as [File]
    expect(emitted[0].name).toBe('dropped.pdf')
  })
})
