import { createTokenPreviewSink } from '../../src/cli/tokenPreview'

describe('createTokenPreviewSink', () => {
  it('is a no-op when disabled (no writes, no crash)', () => {
    const writes: string[] = []
    const sink = createTokenPreviewSink(false, chunk => writes.push(chunk))
    sink.push('hello')
    sink.push('world')
    sink.clear()
    expect(writes).toEqual([])
  })

  it('rewrites a single stderr line per chunk with a ticking char count', () => {
    const writes: string[] = []
    const sink = createTokenPreviewSink(true, chunk => writes.push(chunk))

    sink.push('import {')
    sink.push(' View } from')
    sink.push(" 'react-native'")

    // Every push is a single \r-cleared line; count grows monotonically.
    expect(writes).toHaveLength(3)
    for (const line of writes) {
      expect(line.startsWith('\r\x1b[2K')).toBe(true)
    }
    expect(writes[0]).toContain('8 chars')
    expect(writes[2]).toContain('35 chars')
  })

  it('shows a truncated preview of the tail (collapses whitespace)', () => {
    const writes: string[] = []
    const sink = createTokenPreviewSink(true, chunk => writes.push(chunk))

    const chunk = 'const styles = StyleSheet.create({ flex: 1 }); '
    sink.push(chunk)
    sink.push(chunk)
    sink.push(chunk)

    const last = writes[writes.length - 1]
    // Preview keeps only the tail; whitespace runs are collapsed to one space.
    expect(last).toMatch(/StyleSheet\.create/)
    expect(last).not.toContain('  ')
    expect(last.length).toBeLessThan(200)
  })

  it('clear() wipes the line without writing a newline', () => {
    const writes: string[] = []
    const sink = createTokenPreviewSink(true, chunk => writes.push(chunk))
    sink.push('some text')
    sink.clear()
    expect(writes[writes.length - 1]).toBe('\r\x1b[2K')
  })
})
