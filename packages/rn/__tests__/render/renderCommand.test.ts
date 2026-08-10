/**
 * renderCommand tests — normalizeRenderFiles (the `--file` parsing fix)
 * Business Source License 1.1 (BSL-1.1)
 */
import { normalizeRenderFiles, normalizeRenderLimit } from '../../src/cli/commands/render'

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

describe('normalizeRenderLimit', () => {
  it('passes valid positive numbers through', () => {
    expect(normalizeRenderLimit(5000)).toBe(5000)
    expect(normalizeRenderLimit(1)).toBe(1)
  })

  it('treats undefined as unset', () => {
    expect(normalizeRenderLimit(undefined)).toBeUndefined()
  })

  it('rejects NaN (commander Number processor on garbage input)', () => {
    expect(normalizeRenderLimit(Number('abc'))).toBeUndefined()
    expect(normalizeRenderLimit(NaN)).toBeUndefined()
    expect(normalizeRenderLimit(Infinity)).toBeUndefined()
  })

  it('rejects non-positive values (a 0 timeout would fire instantly)', () => {
    expect(normalizeRenderLimit(0)).toBeUndefined()
    expect(normalizeRenderLimit(-5)).toBeUndefined()
  })
})
