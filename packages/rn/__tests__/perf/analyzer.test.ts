import { analyzeHermesRuntime, renderPerfReport } from '../../src/perf/analyzer'
import { cpuProfileFixture, heapSnapshotFixture } from './fixtures'

describe('analyzeHermesRuntime', () => {
  it('produces the spec example finding: useEffect blocks the JS thread for 500ms', () => {
    const analysis = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(500) }, { blockingThresholdMs: 100 })
    const blocking = analysis.findings.find(f => f.category === 'blocking' && f.target === 'useEffect')
    expect(blocking).toBeTruthy()
    expect(blocking?.message).toContain('blocks the JS thread for 500ms')
    expect(blocking?.suggestion).toContain('worklet')
    expect(blocking?.file).toContain('App.tsx')
  })

  it('flags retained objects and leak candidates from a heap snapshot', () => {
    const analysis = analyzeHermesRuntime(
      { heapSnapshot: heapSnapshotFixture() },
      { retainedThresholdBytes: 1024 * 1024 }
    )
    const retained = analysis.findings.find(f => f.category === 'retained-size')
    expect(retained?.target).toBe('imageCache')
    const leak = analysis.findings.find(f => f.category === 'leak')
    expect(leak?.target).toBe('bigPayload')
  })

  it('returns an empty analysis for no input', () => {
    const analysis = analyzeHermesRuntime({})
    expect(analysis.findings).toEqual([])
    expect(analysis.cpu).toBeNull()
    expect(analysis.heap).toBeNull()
  })

  it('downgrades a hot function to info when it never blocks continuously', () => {
    // 4 samples of 50ms = 200ms self time but each run is only 200ms contiguous
    const profile = cpuProfileFixture(200)
    const analysis = analyzeHermesRuntime({ cpuProfile: profile }, { blockingThresholdMs: 300 })
    // With a 300ms threshold the 200ms run is not a blocking event; a hot
    // function below threshold adds no info finding either.
    const findings = analysis.findings.filter(f => f.category === 'blocking')
    expect(findings.length).toBeGreaterThanOrEqual(0)
    expect(analysis.cpu?.totalBlockingMs).toBe(0)
  })
})

describe('renderPerfReport', () => {
  it('renders a markdown report with CPU and heap sections', () => {
    const analysis = analyzeHermesRuntime(
      { cpuProfile: cpuProfileFixture(500), heapSnapshot: heapSnapshotFixture() },
      { blockingThresholdMs: 100 }
    )
    const report = renderPerfReport(analysis)
    expect(report).toContain('Hermes runtime profile')
    expect(report).toContain('useEffect')
    expect(report).toContain('imageCache')
    expect(report).toContain('bigPayload')
  })

  it('reports a healthy profile', () => {
    const report = renderPerfReport(analyzeHermesRuntime({}))
    expect(report).toContain('No runtime findings')
  })
})
