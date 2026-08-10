/**
 * renderCommand tests — normalizeRenderFiles (the `--file` parsing fix)
 * Business Source License 1.1 (BSL-1.1)
 */
import { normalizeRenderFiles } from '../../src/cli/commands/render'

describe('normalizeRenderFiles', () => {
  it('returns [] for undefined / empty', () => {
    expect(normalizeRenderFiles(undefined)).toEqual([])
    expect(normalizeRenderFiles('')).toEqual([])
    expect(normalizeRenderFiles([])).toEqual([])
  })

  it('splits a comma-separated string (commander single-value shape)', () => {
    expect(normalizeRenderFiles('src/hooks/useX.ts,src/services/XApi.ts')).toEqual([
      'src/hooks/useX.ts',
      'src/services/XApi.ts',
    ])
  })

  it('accepts an array (collected repeated flags shape) and trims entries', () => {
    expect(normalizeRenderFiles(['a.ts', ' b.ts, c.ts '])).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('drops empty entries from trailing commas', () => {
    expect(normalizeRenderFiles('a.ts,,b.ts,')).toEqual(['a.ts', 'b.ts'])
  })

  it('does not leak single characters from a string (regression: spread bug)', () => {
    expect(normalizeRenderFiles('package.json')).toEqual(['package.json'])
  })
})
