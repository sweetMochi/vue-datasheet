import { describe, it, expect, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import SubmitGuard from './SubmitGuard.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import '@/style.css'
import type { ExtractedField } from '@/types/field'

function missing(id: string, label: string): ExtractedField {
  return { id, label, group: '基本資料', value: '', confidence: null, required: true, page: 1 }
}

describe('SubmitGuard', () => {
  it('沒有缺漏時整條帶子不存在，不佔版面', async () => {
    const screen = await render(SubmitGuard, { props: { issues: [] } })

    expect(screen.container.textContent).toBe('')
  })

  /**
   * 灰掉的送出鈕不會告訴使用者三件事：為什麼不行、缺哪幾個、點一下要去哪。
   * 這條帶子把三件事都說了。
   */
  it('列出缺哪幾個欄位，不只說「還不能送出」', async () => {
    const screen = await render(SubmitGuard, {
      props: { issues: [missing('f1', '品名'), missing('f7', '有效日期')] },
    })

    expect(screen.container.textContent).toContain('還不能送出')
    expect(screen.container.textContent).toContain('2 個法規必填欄位')
    expect(screen.container.textContent).toContain('品名')
    expect(screen.container.textContent).toContain('有效日期')
  })

  it('「跳到第一個」帶的是第一個缺漏欄位的 id', async () => {
    const screen = await render(SubmitGuard, {
      props: { issues: [missing('f1', '品名'), missing('f7', '有效日期')] },
    })

    await screen.getByRole('button', { name: '跳到第一個' }).click()

    expect(screen.emitted('jump')?.at(-1)).toEqual(['f1'])
  })
})

describe('ModalDialog', () => {
  /**
   * 用原生 <dialog> 換到的東西：焦點鎖在對話框內、Esc 關閉、背景不可點。
   * 自己用 div + fixed 刻的話這些都要重寫，而且通常會漏。
   */
  it('open 為 false 時不是 modal 狀態', async () => {
    const screen = await render(ModalDialog, {
      props: { open: false, title: '確定要送出嗎？' },
    })

    const dialog = screen.container.querySelector('dialog')!
    expect(dialog.open).toBe(false)
  })

  it('用 showModal() 開啟，不是直接設 open 屬性', async () => {
    /*
     * 這個差別就是整個元件的價值所在：showModal() 才有焦點鎖定、Esc 關閉、
     * 背景 inert 與 ::backdrop；設 open 屬性只是把它顯示出來，什麼都沒有。
     *
     * 不用 `:modal` 斷言，因為測試框架會把容器重新插入 DOM，
     * 而 modal dialog 一被移動就退出 top layer（open 仍是 true）——
     * 那是 harness 的行為，不是元件的。
     */
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')

    const screen = await render(ModalDialog, {
      props: { open: true, title: '確定要送出嗎？' },
    })
    await new Promise((r) => setTimeout(r, 30))

    expect(showModal).toHaveBeenCalledTimes(1)
    expect(screen.container.querySelector('dialog')!.open).toBe(true)
    showModal.mockRestore()
  })

  it('Esc 會關閉並往上拋 close，讓父層清掉狀態', async () => {
    const screen = await render(ModalDialog, {
      props: { open: true, title: '送出完成' },
    })
    await new Promise((r) => setTimeout(r, 30))

    const dialog = screen.container.querySelector('dialog')!
    dialog.dispatchEvent(new Event('close'))

    expect(screen.emitted('close')).toHaveLength(1)
  })

  it('標題與內容都渲染得出來', async () => {
    const screen = await render(ModalDialog, {
      props: { open: true, title: '送出完成' },
      slots: { default: '欄位資料已輸出到 console' },
    })
    await new Promise((r) => setTimeout(r, 30))

    expect(screen.container.textContent).toContain('送出完成')
    expect(screen.container.textContent).toContain('欄位資料已輸出到 console')
  })
})
