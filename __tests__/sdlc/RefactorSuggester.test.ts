import { RefactorSuggester } from '../../src/sdlc/RefactorSuggester'

describe('RefactorSuggester', () => {
  it('flags very large files', () => {
    const code = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i}`).join('\n')
    const suggestions = new RefactorSuggester().suggest(code, 'Huge.tsx')
    expect(suggestions).toEqual(
      expect.arrayContaining([expect.objectContaining({ pattern: 'file-too-large', severity: 'high' })])
    )
  })

  it('flags any types', () => {
    const suggestions = new RefactorSuggester().suggest('const x: any = 1\n')
    expect(suggestions).toEqual(expect.arrayContaining([expect.objectContaining({ pattern: 'avoid-any' })]))
  })

  it('flags magic numbers', () => {
    const suggestions = new RefactorSuggester().suggest('const width = 320\n')
    expect(suggestions).toEqual(expect.arrayContaining([expect.objectContaining({ pattern: 'magic-numbers' })]))
  })

  it('flags long functions', () => {
    const body = Array.from({ length: 30 }, (_, i) => `  console.log(${i})`).join('\n')
    const code = `const build = () => {\n${body}\n}\n`
    const suggestions = new RefactorSuggester().suggest(code)
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pattern: 'long-function', suggestion: expect.stringContaining('build') }),
      ])
    )
  })

  it('returns no suggestions for clean short code', () => {
    expect(new RefactorSuggester().suggest('const x = 1\n')).toEqual([])
  })
})
