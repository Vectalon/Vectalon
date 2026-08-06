import { DebugAnalyzer } from '../../src/sdlc/DebugAnalyzer'

describe('DebugAnalyzer', () => {
  it('categorizes module resolution errors', () => {
    const result = new DebugAnalyzer().analyzeError('Unable to resolve module ./foo/bar')
    expect(result.category).toBe('module-resolution')
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('categorizes null reference errors', () => {
    const result = new DebugAnalyzer().analyzeError('TypeError: null is not an object')
    expect(result.category).toBe('null-reference')
  })

  it('categorizes invariant violations', () => {
    const result = new DebugAnalyzer().analyzeError('Invariant Violation: Could not find navigation container')
    expect(result.category).toBe('invariant-violation')
  })

  it('categorizes native build failures', () => {
    const result = new DebugAnalyzer().analyzeError('Pods failed to install during xcode build')
    expect(result.category).toBe('native-build')
  })

  it('falls back to unknown for unmatched errors', () => {
    const result = new DebugAnalyzer().analyzeError('some completely unrelated runtime problem')
    expect(result.category).toBe('unknown')
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('accepts optional project context without changing the category', () => {
    const result = new DebugAnalyzer().analyzeError('Unable to resolve module ./foo', 'context here')
    expect(result.category).toBe('module-resolution')
  })
})
