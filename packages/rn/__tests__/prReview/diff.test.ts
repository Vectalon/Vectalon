import { parseUnifiedDiff, addedLineSet } from '../../src/prReview/diff'

describe('vc pr — unified diff parser', () => {
  it('parses files, hunks, and added lines with new-file line numbers', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '-line2',
      '+line2b',
      '+line3',
      ' line4',
      'diff --git a/src/b.ts b/src/b.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/b.ts',
      '@@ -0,0 +1,2 @@',
      '+x',
      '+y',
      '',
    ].join('\n')

    const files = parseUnifiedDiff(diff)
    expect(files.map(f => f.path)).toEqual(['src/a.ts', 'src/b.ts'])

    const a = files[0]
    expect(a.additions).toBe(2)
    expect(a.deletions).toBe(1)
    expect(a.addedLines).toEqual([
      { line: 2, text: 'line2b' },
      { line: 3, text: 'line3' },
    ])
    expect([...addedLineSet(a)]).toEqual([2, 3])

    const b = files[1]
    expect(b.additions).toBe(2)
    expect(b.deletions).toBe(0)
    expect(b.addedLines).toEqual([
      { line: 1, text: 'x' },
      { line: 2, text: 'y' },
    ])
  })

  it('handles multiple hunks per file and no-newline markers', () => {
    const diff = [
      'diff --git a/src/x.ts b/src/x.ts',
      '--- a/src/x.ts',
      '+++ b/src/x.ts',
      '@@ -1,1 +1,2 @@',
      ' a',
      '+b',
      '@@ -10,1 +11,2 @@',
      ' j',
      '+k',
      '\\ No newline at end of file',
      '',
    ].join('\n')
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].addedLines).toEqual([
      { line: 2, text: 'b' },
      { line: 12, text: 'k' },
    ])
  })

  it('parses diffs without the git header (raw hunk-only input)', () => {
    const files = parseUnifiedDiff('@@ -0,0 +1,2 @@\n+a\n+b\n')
    expect(files).toHaveLength(1)
    expect(files[0].addedLines).toEqual([
      { line: 1, text: 'a' },
      { line: 2, text: 'b' },
    ])
  })

  it('returns empty for empty or non-diff input', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('just some text')).toEqual([])
  })

  it('dedupes repeated headers for the same path', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,1 +1,2 @@',
      ' a',
      '+b',
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,1 @@',
      '-a',
      ' b',
      '',
    ].join('\n')
    const files = parseUnifiedDiff(diff)
    // The section with added lines wins.
    expect(files).toHaveLength(1)
    expect(files[0].additions).toBe(1)
  })
})
