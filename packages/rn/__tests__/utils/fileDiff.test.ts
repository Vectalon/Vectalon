import {
  diffLines,
  computeFileChange,
  formatFileChange,
  setFileChangeWriter,
  reportPathChange,
  reportFileChange,
  type FileChange,
} from '../../src/utils/fileDiff'

describe('diffLines', () => {
  it('returns context lines for identical content', () => {
    const diff = diffLines('a\nb\nc', 'a\nb\nc')
    expect(diff).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'context', text: 'c' },
    ])
  })

  it('marks inserted lines as add', () => {
    const diff = diffLines('a\nc', 'a\nb\nc')
    const kinds = diff.map(l => l.kind)
    expect(kinds).toContain('add')
    expect(diff.find(l => l.kind === 'add')?.text).toBe('b')
  })

  it('marks removed lines as remove', () => {
    const diff = diffLines('a\nb\nc', 'a\nc')
    const kinds = diff.map(l => l.kind)
    expect(kinds).toContain('remove')
    expect(diff.find(l => l.kind === 'remove')?.text).toBe('b')
  })

  it('falls back to full replace for huge inputs', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `line${i}`).join('\n')
    const b = Array.from({ length: 2000 }, (_, i) => `other${i}`).join('\n')
    const diff = diffLines(a, b)
    expect(diff.filter(l => l.kind === 'add')).toHaveLength(2000)
    expect(diff.filter(l => l.kind === 'remove')).toHaveLength(2000)
  })
})

describe('computeFileChange', () => {
  it('counts additions and deletions', () => {
    const change = computeFileChange('src/App.tsx', 'modified', 'const x = 1\n', 'const y = 2\n')
    expect(change.action).toBe('modified')
    expect(change.additions).toBe(1)
    expect(change.deletions).toBe(1)
  })

  it('treats null old content as created', () => {
    const change = computeFileChange('src/App.tsx', 'created', null, 'const x = 1\n')
    expect(change.action).toBe('created')
    expect(change.additions).toBe(1)
    expect(change.deletions).toBe(0)
  })
})

describe('formatFileChange', () => {
  it('includes the header with action, path and stats', () => {
    const change: FileChange = {
      path: 'src/App.tsx',
      action: 'modified',
      additions: 1,
      deletions: 1,
      diff: [
        { kind: 'remove', text: 'old' },
        { kind: 'add', text: 'new' },
      ],
    }
    const out = formatFileChange(change)
    expect(out).toContain('Modified')
    expect(out).toContain('src/App.tsx')
    expect(out).toContain('+1')
    expect(out).toContain('-1')
  })

  it('truncates very long diffs with a note', () => {
    const diff = Array.from({ length: 500 }, (_, i) => ({ kind: 'add' as const, text: `line${i}` }))
    const out = formatFileChange({ path: 'a.ts', action: 'created', additions: 500, deletions: 0, diff })
    expect(out).toContain('380 more lines')
  })
})

describe('writer sink', () => {
  afterEach(() => setFileChangeWriter(null))

  it('is a no-op when no writer is installed', () => {
    expect(() => reportPathChange('a.ts', null, 'hello')).not.toThrow()
    expect(() => reportFileChange(computeFileChange('a.ts', 'created', null, 'hello'))).not.toThrow()
  })

  it('delivers a created change with the computed diff', () => {
    const received: FileChange[] = []
    setFileChangeWriter(c => received.push(c))
    reportPathChange('src/New.ts', null, 'const a = 1\n')
    expect(received).toHaveLength(1)
    expect(received[0].action).toBe('created')
    expect(received[0].path).toBe('src/New.ts')
    expect(received[0].additions).toBe(1)
  })

  it('delivers a modified change for existing content', () => {
    const received: FileChange[] = []
    setFileChangeWriter(c => received.push(c))
    reportPathChange('src/Edit.ts', 'old', 'new')
    expect(received[0].action).toBe('modified')
  })

  it('never lets a throwing writer break the caller', () => {
    setFileChangeWriter(() => {
      throw new Error('boom')
    })
    expect(() => reportPathChange('a.ts', null, 'x')).not.toThrow()
  })
})
