import { it, expect, afterEach } from 'vitest'
import './style.css'

/**
 * 這幾支守的是設定，不是畫面。
 *
 * Tailwind 的 @import 曾經為了唯讀階段的可讀性被註解掉過（見 git 歷史），
 * 那時候整份樣式是靜默失效的 —— 畫面還看得懂，所以沒有人會發現。
 * 這裡讓它變成會紅的測試。
 */

let el: HTMLElement | null = null

function render(className: string) {
  el = document.createElement('div')
  el.className = className
  document.body.append(el)
  return getComputedStyle(el)
}

afterEach(() => {
  el?.remove()
  el = null
})

it('Tailwind 有生效，而且 @theme 的 token 接得上 utility', () => {
  const style = render('bg-danger text-muted')

  expect(style.backgroundColor).toBe('rgb(158, 50, 38)')
  expect(style.color).toBe('rgb(96, 92, 85)')
})

it('三個狀態色各自獨立，不會被合併或蓋掉', () => {
  expect(render('bg-caution').backgroundColor).toBe('rgb(138, 90, 0)')
  el!.remove()
  expect(render('bg-choose').backgroundColor).toBe('rgb(53, 87, 138)')
})

it('內建調色盤已清掉 —— bg-blue-500 不該產生任何規則', () => {
  // 顏色只給「要你動手」這一件事。留著內建調色盤，遲早有人拿 blue-500
  // 去標一個不需要使用者處理的東西，那個判斷就破功了
  expect(render('bg-blue-500').backgroundColor).toBe('rgba(0, 0, 0, 0)')
})

it('不做 RWD，但窄螢幕是橫向捲動而不是爆版', () => {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.append(app)

  expect(getComputedStyle(app).minWidth).toBe('1120px')

  app.remove()
})
