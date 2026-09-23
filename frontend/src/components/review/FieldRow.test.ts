import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import FieldRow from './FieldRow.vue'
import '@/style.css'
import type { ExtractedField, FieldDraft, FieldStatus } from '@/types/field'

function field(partial: Partial<ExtractedField> = {}): ExtractedField {
  return {
    id: 'f1',
    label: '批號',
    group: '基本資料',
    value: 'A26031501',
    confidence: 0.93,
    required: false,
    page: 2,
    ...partial,
  }
}

function draft(partial: Partial<FieldDraft> = {}): FieldDraft {
  return { value: 'A26031501', confirmed: false, touched: false, ...partial }
}

function mount(status: FieldStatus, f = field(), d = draft()) {
  return render(FieldRow, { props: { field: f, draft: d, status } })
}

/** 色條的實際底色，用來確認「顏色只給要你動手的列」 */
function barColor(container: HTMLElement) {
  const bar = container.querySelector('[data-testid="confidence-mark"]')!
  return getComputedStyle(bar).backgroundColor
}

describe('顏色只給「要你動手」的列', () => {
  it('安靜的列沒有色條、沒有標註、沒有確認鈕', async () => {
    const screen = await mount('ok')

    expect(barColor(screen.container)).toBe('rgba(0, 0, 0, 0)')
    await expect.element(screen.getByRole('button', { name: '確認' })).not.toBeInTheDocument()
    expect(screen.container.textContent).not.toContain('把握度低')
  })

  it('三種需要處理的狀態各自是自己的顏色', async () => {
    const missing = await mount(
      'missing',
      field({ required: true, value: '' }),
      draft({ value: '' }),
    )
    expect(barColor(missing.container)).toBe('rgb(158, 50, 38)')
    await missing.unmount()

    const low = await mount('lowConfidence')
    expect(barColor(low.container)).toBe('rgb(138, 90, 0)')
    await low.unmount()

    const multi = await mount('multiCandidate', field({ candidates: ['甲', '乙'] }))
    expect(barColor(multi.container)).toBe('rgb(53, 87, 138)')
  })
})

describe('把握度不顯示百分比', () => {
  it('數字只進 title，畫面上看不到', async () => {
    const screen = await mount('lowConfidence', field({ confidence: 0.42 }))

    // 0.39 與 0.51 對使用者的動作沒有差別，都是「去看一眼」
    expect(screen.container.textContent).not.toContain('42')
    expect(screen.container.textContent).not.toContain('0.42')

    const bar = screen.container.querySelector('[data-testid="confidence-mark"]')!
    expect(bar.getAttribute('title')).toContain('42%')
  })

  it('色條對讀螢幕器隱藏 —— 同一件事旁邊的文字已經說過', async () => {
    const screen = await mount('lowConfidence')
    const bar = screen.container.querySelector('[data-testid="confidence-mark"]')!

    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(screen.container.textContent).toContain('把握度低')
  })
})

describe('值永遠是真的 input', () => {
  /**
   * 安靜的列看起來像純文字，但底下是一個沒有外框的 input。
   * 做成「點一下才變輸入框」的話，鍵盤會直接跳過八成的欄位。
   */
  it('安靜的列也對得上 label、也進得了 Tab 順序', async () => {
    const screen = await mount('ok')

    const input = screen.getByLabelText('批號')
    await expect.element(input).toBeInTheDocument()
    expect((input.element() as HTMLInputElement).value).toBe('A26031501')
  })

  it('打字會把新的值往上拋', async () => {
    const screen = await mount('ok')

    await screen.getByLabelText('批號').fill('B26053002')

    expect(screen.emitted('update:value')?.at(-1)).toEqual(['B26053002'])
  })

  it('必填缺漏的列有提示文字與 aria-invalid', async () => {
    const screen = await mount(
      'missing',
      field({ label: '品名', required: true, value: '', confidence: null }),
      draft({ value: '' }),
    )

    const input = screen.getByLabelText(/品名/)
    expect((input.element() as HTMLInputElement).placeholder).toBe('文件裡沒抽到，請補上')
    expect(input.element().getAttribute('aria-invalid')).toBe('true')
  })
})

describe('候選答案是選項，不是標籤', () => {
  it('每個候選都是可按的按鈕，並標出目前選中的那個', async () => {
    const screen = await mount(
      'multiCandidate',
      field({ label: '製造日期', candidates: ['2026/03/15', '2026/05/30'] }),
      draft({ value: '2026/03/15' }),
    )

    const chosen = screen.getByRole('button', { name: '2026/03/15' })
    await expect.element(chosen).toHaveAttribute('aria-pressed', 'true')

    const other = screen.getByRole('button', { name: '2026/05/30' })
    await expect.element(other).toHaveAttribute('aria-pressed', 'false')

    await other.click()
    expect(screen.emitted('choose')?.at(-1)).toEqual(['2026/05/30'])
  })

  it('「都不對，自己填」把游標送進輸入框，不是死路', async () => {
    const screen = await mount(
      'multiCandidate',
      field({ label: '製造日期', candidates: ['甲', '乙'] }),
    )

    await screen.getByRole('button', { name: '都不對，自己填' }).click()

    expect(document.activeElement).toBe(screen.getByLabelText('製造日期').element())
  })
})

describe('確認與重設', () => {
  it('確認鈕只出現在需要判斷的列上', async () => {
    const low = await mount('lowConfidence')
    await low.getByRole('button', { name: '確認' }).click()
    expect(low.emitted('confirm')).toHaveLength(1)
    await low.unmount()

    // 必填缺漏要的是「把值補上」，不是「按確認」
    const missing = await mount(
      'missing',
      field({ required: true, value: '' }),
      draft({ value: '' }),
    )
    await expect.element(missing.getByRole('button', { name: '確認' })).not.toBeInTheDocument()
    await missing.unmount()

    // 補上值之後才要確認
    const filled = await mount(
      'unconfirmed',
      field({ required: true, value: '', confidence: null }),
      draft({ value: '經典原味火腿', touched: true }),
    )
    expect(filled.container.textContent).toContain('已補值 · 請確認')
    expect(filled.container.textContent).not.toContain('把握度低')
    await filled.getByRole('button', { name: '確認' }).click()
    expect(filled.emitted('confirm')).toHaveLength(1)
  })

  it('重設只在真的改過之後才出現', async () => {
    const untouched = await mount('ok')
    await expect.element(untouched.getByRole('button', { name: '重設' })).not.toBeInTheDocument()
    await untouched.unmount()

    const edited = await mount('ok', field({ value: '原值' }), draft({ value: '改過的值' }))
    await edited.getByRole('button', { name: '重設' }).click()
    expect(edited.emitted('reset')).toHaveLength(1)
  })
})

describe('效能的硬規則', () => {
  /**
   * FieldRow 會被實體化上百次。log/07 的數字（300 列在 4 倍 CPU 降速下按鍵 p95 3.8ms）
   * 是在「不連 store、父層算好再傳 props」這個前提下量到的。
   * 一旦有人在這裡 import store，那些數字與「不做虛擬捲動」的結論都不成立。
   */
  it('原始碼沒有 import 任何 composable', async () => {
    const source = await import('./FieldRow.vue?raw').then((m) => m.default as string)

    // 只看 import 敘述，不看註解 —— 檔案開頭本來就會提到 useReviewStore 這個名字
    const imports = source.match(/^\s*import .*$/gm) ?? []

    expect(imports.filter((line) => line.includes('@/composables'))).toEqual([])
    expect(source).not.toMatch(/\bwatch\s*\(/)
  })
})
