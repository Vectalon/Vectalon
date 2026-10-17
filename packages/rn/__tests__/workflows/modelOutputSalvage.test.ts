import { parseModelOutput } from '../../src/workflows/phases/implementationPhase'

describe('corrupt JSON envelope recovery', () => {
  it('decodes a complete JSON file object exactly once', () => {
    const file = { path: 'src/value.ts', content: 'export const text = "quoted";\n\tconst pattern = /\\n/;\r\n' }
    expect(parseModelOutput(`{"files":[${JSON.stringify(file)}, BROKEN`)).toEqual({ files: [file] })
  })

  it('checks decoded paths rather than accepting encoded traversal', () => {
    expect(parseModelOutput('{"files":[{"path":"\\u002e\\u002e/escape.ts","content":"x"}, BROKEN')).toBeNull()
  })

  it('skips invalid JSON escapes instead of returning corrupted source', () => {
    expect(parseModelOutput('{"files":[{"path":"src/value.ts","content":"bad\\q"}, BROKEN')).toBeNull()
  })

  it('continues past an invalid object and decodes a valid escaped path', () => {
    const response = '{"files":[{"path":"src/bad.ts","content":"bad\\q"},'
      + '{"path":"src\\u002fvalue.ts","content":"export const value = 1;"}, BROKEN'
    expect(parseModelOutput(response)).toEqual({ files: [{ path: 'src/value.ts', content: 'export const value = 1;' }] })
  })

  it('preserves backtick bodies verbatim without evaluating interpolation', () => {
    const content = 'const pattern = /\\n/;\nconst marker = "${secret}";'
    expect(parseModelOutput('{"files":[{"path":"src/value.ts","content":`' + content + '`}, BROKEN'))
      .toEqual({ files: [{ path: 'src/value.ts', content }] })
  })
})
