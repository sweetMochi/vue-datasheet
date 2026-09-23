import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import TriageBar from './TriageBar.vue'
import GroupNav from './GroupNav.vue'
import '@/style.css'

describe('TriageBar 只問一個問題', () => {
  /**
   * 參考圖在這裡放了六個狀態 chip 加兩個排序下拉。那要求使用者先讀懂六種分類，
   * 才知道該按哪一個。這裡只問「你要看還沒處理的，還是全部」。
   */
  it('只有兩個分段，沒有第三顆篩選鈕', async () => {
    const screen = await render(TriageBar, {
      props: { pendingCount: 12, totalCount: 120, visibleCount: 12, mode: 'pending', keyword: '' },
    })

    const buttons = screen.container.querySelectorAll('[role="group"] button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].textContent?.trim()).toBe('需要你處理 12')
    expect(buttons[1].textContent?.trim()).toBe('全部 120')
  })

  it('沒有排序控制項 —— 排序會打散群組', async () => {
    const screen = await render(TriageBar, {
      props: { pendingCount: 12, totalCount: 120, visibleCount: 12, mode: 'pending', keyword: '' },
    })

    expect(screen.container.querySelector('select')).toBeNull()
    expect(screen.container.textContent).not.toContain('排序')
  })

  it('切換分段會把選擇往上拋', async () => {
    const screen = await render(TriageBar, {
      props: { pendingCount: 12, totalCount: 120, visibleCount: 12, mode: 'pending', keyword: '' },
    })

    await screen.getByRole('button', { name: '全部 120' }).click()

    expect(screen.emitted('update:mode')?.at(-1)).toEqual(['all'])
  })

  it('待處理用跟側欄一樣的角標，沒有待處理就不顯示', async () => {
    const screen = await render(TriageBar, {
      props: { pendingCount: 0, totalCount: 120, visibleCount: 0, mode: 'pending', keyword: '' },
    })

    expect(screen.container.querySelectorAll('.bg-danger-bg')).toHaveLength(0)

    await screen.rerender({ pendingCount: 3 })
    const badges = screen.container.querySelectorAll('.bg-danger-bg')
    expect(badges).toHaveLength(1)
    expect(badges[0].textContent?.trim()).toBe('3')
  })

  /**
   * 群組是在側欄選的，離清單很遠。不提示的話，使用者會以為其他組的欄位不見了。
   */
  it('選了群組會在清單上方標出來，按 × 就地取消', async () => {
    const screen = await render(TriageBar, {
      props: {
        pendingCount: 5,
        totalCount: 38,
        visibleCount: 5,
        mode: 'pending',
        keyword: '',
        group: '基本資料',
      },
    })

    expect(screen.container.textContent).toContain('群組：基本資料')

    await screen.getByRole('button', { name: '取消只看基本資料' }).click()

    expect(screen.emitted('update:group')?.at(-1)).toEqual([null])
  })

  it('沒選群組就不出現群組標籤', async () => {
    const screen = await render(TriageBar, {
      props: { pendingCount: 12, totalCount: 120, visibleCount: 12, mode: 'pending', keyword: '' },
    })

    expect(screen.container.textContent).not.toContain('群組：')
  })

  it('搜尋框對得上 label', async () => {
    const screen = await render(TriageBar, {
      props: { pendingCount: 1, totalCount: 1, visibleCount: 1, mode: 'all', keyword: '' },
    })

    await expect.element(screen.getByLabelText('搜尋欄位名稱或值')).toBeInTheDocument()
  })
})

describe('GroupNav 只有一個大數字', () => {
  const groups = [
    { name: '基本資料', pending: 5, total: 38 },
    { name: '營養標示', pending: 0, total: 32 },
  ]

  /**
   * 參考圖把總數、已確認、低把握、必填、缺漏、多候選六個統計並排，
   * 每一個都同樣大聲，等於沒有指標。
   */
  it('「需要你處理」是唯一的主指標', async () => {
    const screen = await render(GroupNav, {
      props: { pendingCount: 12, groups, active: null },
    })

    expect(screen.container.textContent).toContain('需要你處理')
    // 不該出現第二組並排的統計
    expect(screen.container.textContent).not.toContain('已確認')
    expect(screen.container.textContent).not.toContain('總欄位數')
  })

  it('沒有待處理的群組不顯示紅色角標', async () => {
    const screen = await render(GroupNav, {
      props: { pendingCount: 5, groups, active: null },
    })

    const badges = screen.container.querySelectorAll('.bg-danger-bg')
    expect(badges).toHaveLength(1)
    expect(badges[0].textContent?.trim()).toBe('5')
  })

  it('點同一組會取消選取，不會卡在那一組', async () => {
    const screen = await render(GroupNav, {
      props: { pendingCount: 5, groups, active: '基本資料' },
    })

    await screen.getByRole('button', { name: /基本資料/ }).click()

    expect(screen.emitted('select')?.at(-1)).toEqual([null])
  })

  it('色條圖例在側欄，因為顏色是這個畫面唯一的導航工具', async () => {
    const screen = await render(GroupNav, {
      props: { pendingCount: 0, groups, active: null },
    })

    expect(screen.container.textContent).toContain('必填但沒抽到')
    expect(screen.container.textContent).toContain('系統把握度低')
    expect(screen.container.textContent).toContain('要你挑一個')
  })
})
