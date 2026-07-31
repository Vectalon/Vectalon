import { RootCauseAnalyzer } from '../../src/sdlc/RootCauseAnalyzer'

describe('RootCauseAnalyzer', () => {
  it('identifies null-reference causes', () => {
    const result = new RootCauseAnalyzer().analyze('Cannot read property name of undefined')
    expect(result.bucket).toBe('null-reference')
    expect(result.investigation.length).toBeGreaterThan(0)
  })

  it('identifies module resolution causes', () => {
    expect(new RootCauseAnalyzer().analyze('Unable to resolve module ./foo').bucket).toBe('module-resolution')
  })

  it('identifies permission causes', () => {
    expect(new RootCauseAnalyzer().analyze('permission denied for camera').bucket).toBe('permissions')
  })

  it('identifies native build causes', () => {
    expect(new RootCauseAnalyzer().analyze('Pods failed during xcode build').bucket).toBe('native-build')
  })

  it('identifies network causes', () => {
    expect(new RootCauseAnalyzer().analyze('network request timed out').bucket).toBe('network')
  })

  it('falls back to unknown', () => {
    const result = new RootCauseAnalyzer().analyze('some completely unrelated issue')
    expect(result.bucket).toBe('unknown')
    expect(result.investigation.length).toBeGreaterThan(0)
  })
})
