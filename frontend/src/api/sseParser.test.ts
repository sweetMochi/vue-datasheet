import { describe, it, expect } from 'vitest'
import { createSseParser } from './sseParser'

/** 把一整段 SSE 文字切成指定大小的 chunk，模擬網路封包邊界 */
function chunked(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

describe('分幀', () => {
  it('解析單一事件', () => {
    const parser = createSseParser()
    const frames = parser.push('event: stage\ndata: {"stage":"辨識版面"}\n\n')

    expect(frames).toEqual([{ event: 'stage', data: '{"stage":"辨識版面"}' }])
  })

  it('一次收到多個事件時全部吐出，且維持順序', () => {
    const parser = createSseParser()
    const frames = parser.push(
      'event: field\ndata: {"id":"f1"}\n\nevent: field\ndata: {"id":"f2"}\n\nevent: done\ndata: {}\n\n',
    )

    expect(frames.map((f) => f.event)).toEqual(['field', 'field', 'done'])
    expect(frames[0].data).toBe('{"id":"f1"}')
    expect(frames[1].data).toBe('{"id":"f2"}')
  })

  it('事件被 chunk 邊界切開時不會掉資料 —— 逐字元餵也要還原', () => {
    const payload =
      'event: field\ndata: {"id":"f1","label":"品名"}\n\nevent: done\ndata: {"field_count":1}\n\n'
    const parser = createSseParser()
    const frames = chunked(payload, 1).flatMap((chunk) => parser.push(chunk))

    expect(frames).toEqual([
      { event: 'field', data: '{"id":"f1","label":"品名"}' },
      { event: 'done', data: '{"field_count":1}' },
    ])
  })

  it('切在事件結尾的空行正中間也要正確分幀', () => {
    const parser = createSseParser()

    // 第一個 chunk 結束在兩個換行之間
    expect(parser.push('event: field\ndata: {"id":"f1"}\n')).toEqual([])
    expect(parser.push('\nevent: field\ndata: {"id":"f2"}\n\n')).toEqual([
      { event: 'field', data: '{"id":"f1"}' },
      { event: 'field', data: '{"id":"f2"}' },
    ])
  })

  it('事件不完整時先不吐出，等後續 chunk', () => {
    const parser = createSseParser()

    expect(parser.push('event: field\ndata: {"id":')).toEqual([])
    expect(parser.push('"f1"}\n\n')).toEqual([{ event: 'field', data: '{"id":"f1"}' }])
  })
})

describe('格式細節', () => {
  it('忽略 keep-alive 註解行', () => {
    const parser = createSseParser()
    const frames = parser.push(': keep-alive\n\nevent: stage\ndata: {"progress":20}\n\n')

    expect(frames).toEqual([{ event: 'stage', data: '{"progress":20}' }])
  })

  it('多行 data 用換行接起來', () => {
    const parser = createSseParser()
    const frames = parser.push('event: field\ndata: {"id":"f1",\ndata: "label":"品名"}\n\n')

    expect(frames[0].data).toBe('{"id":"f1",\n"label":"品名"}')
  })

  it('沒有 event: 行時依規格預設為 message', () => {
    const parser = createSseParser()
    const frames = parser.push('data: hello\n\n')

    expect(frames).toEqual([{ event: 'message', data: 'hello' }])
  })

  it('只吃掉冒號後的第一個空格，其餘保留', () => {
    const parser = createSseParser()
    const frames = parser.push('event: stage\ndata:  兩個空格開頭\n\n')

    expect(frames[0].data).toBe(' 兩個空格開頭')
  })

  it('沒有 data 的區塊不派送', () => {
    const parser = createSseParser()

    expect(parser.push('event: stage\n\n')).toEqual([])
  })
})

describe('換行符', () => {
  it('支援 CRLF 換行', () => {
    const parser = createSseParser()
    const frames = parser.push('event: field\r\ndata: {"id":"f1"}\r\n\r\n')

    expect(frames).toEqual([{ event: 'field', data: '{"id":"f1"}' }])
  })

  it('CRLF 被 chunk 切在 CR 與 LF 之間時不會誤判成事件結束', () => {
    const parser = createSseParser()

    // chunk 結尾是 \r，下一個 chunk 開頭是 \n —— 這對 CR LF 屬於同一個換行，
    // 提早把 \r 換成 \n 的話會變成「\n\n」而把事件切成兩半
    expect(parser.push('event: field\r\ndata: {"id":"f1"}\r')).toEqual([])
    expect(parser.push('\ndata: {"id":"f2"}\r\n\r\n')).toEqual([
      { event: 'field', data: '{"id":"f1"}\n{"id":"f2"}' },
    ])
  })
})

describe('串流結束', () => {
  it('flush 會補送最後一個沒有尾隨空行的事件', () => {
    const parser = createSseParser()

    expect(parser.push('event: field\ndata: {"id":"f1"}')).toEqual([])
    expect(parser.flush()).toEqual([{ event: 'field', data: '{"id":"f1"}' }])
  })

  it('已經乾淨結束時 flush 不會多吐東西出來', () => {
    const parser = createSseParser()
    parser.push('event: done\ndata: {}\n\n')

    expect(parser.flush()).toEqual([])
  })
})
