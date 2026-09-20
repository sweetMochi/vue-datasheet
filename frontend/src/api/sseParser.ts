/**
 * SSE 框架解析器。
 *
 * 改用 fetch + ReadableStream 之後，原本由瀏覽器代勞的 SSE 分幀變成自己的責任。
 * 這支是純函式（push 進字串、吐出事件），所以可以直接餵它被切爛的 chunk 序列來測，
 * 不需要真的後端，也不需要瀏覽器。
 *
 * 只實作本專案後端會用到的子集：event、data、註解行。
 * 後端的 _sse() 不送 id 也不送 retry，所以斷線續傳這件事不存在（見 ARCHITECTURE.md）。
 */

export interface SseFrame {
  /** 事件名稱。沒有 event: 行時依規格預設為 message */
  event: string
  /** 多行 data: 以 \n 接起來 */
  data: string
}

export interface SseParser {
  /** 餵一段解碼後的文字，吐出這段裡完整的事件 */
  push(chunk: string): SseFrame[]
  /** 串流結束時呼叫，處理沒有尾隨空行的最後一個事件 */
  flush(): SseFrame[]
}

export function createSseParser(): SseParser {
  let buffer = ''

  function drain(): SseFrame[] {
    const frames: SseFrame[] = []
    for (;;) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary === -1) break
      const frame = parseBlock(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      if (frame) frames.push(frame)
    }
    return frames
  }

  return {
    push(chunk) {
      buffer += chunk

      // 結尾的 \r 先留著不正規化 —— 它可能是 \r\n 被 chunk 邊界切開的前半，
      // 現在就換成 \n 的話，下一個 chunk 開頭的 \n 會被誤判成事件結束的空行
      let carry = ''
      if (buffer.endsWith('\r')) {
        carry = '\r'
        buffer = buffer.slice(0, -1)
      }
      buffer = buffer.replace(/\r\n|\r/g, '\n')

      const frames = drain()
      buffer += carry
      return frames
    },

    flush() {
      buffer = buffer.replace(/\r\n|\r/g, '\n')
      const frames = drain()
      // 最後一個事件後面可能沒有空行（例如後端被 kill 掉），補送出去
      const rest = buffer.trim()
      buffer = ''
      if (rest === '') return frames
      const frame = parseBlock(rest)
      return frame ? [...frames, frame] : frames
    },
  }
}

function parseBlock(block: string): SseFrame | null {
  let event = 'message'
  const data: string[] = []

  for (const line of block.split('\n')) {
    // 空行不會出現在這裡（block 是以空行切出來的），冒號開頭是註解／keep-alive
    if (line === '' || line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    // 規格：冒號後若有一個空格要吃掉，之後的空格保留
    const rawValue = colon === -1 ? '' : line.slice(colon + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    // id 與 retry 後端不送，忽略
  }

  // 沒有 data 的事件依規格不派送（純註解或只有 retry 的區塊）
  if (data.length === 0) return null
  return { event, data: data.join('\n') }
}
