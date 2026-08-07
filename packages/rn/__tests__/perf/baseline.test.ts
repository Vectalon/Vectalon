import { createTempProject, cleanup } from '../helpers/tmp'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { analyzeHermesRuntime } from '../../src/perf/analyzer'
import { recordPerfBaseline, getLatestPerfBaseline, compareToBaseline, pctGrowth, summarizeAnalysis } from '../../src/perf/baseline'
import { cpuProfileFixture, heapSnapshotFixture } from './fixtures'

describe('perf baselines in the knowledge base', () => {
  let dir: string
  let store: ArtifactStore

  beforeEach(() => {
    dir = createTempProject({ 'package.json': '{}' })
    store = new ArtifactStore(dir, { engine: 'json' })
  })

  afterEach(() => {
    store.close()
    cleanup(dir)
  })

  it('persists a baseline artifact and reads it back', () => {
    const analysis = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(200) })
    recordPerfBaseline(store, analysis, 'main')
    const stored = getLatestPerfBaseline(store, 'main')
    expect(stored).not.toBeNull()
    expect(stored?.label).toBe('main')
    expect(stored?.totalBlockingMs).toBe(200)
    expect(stored?.hotFunction).toBe('useEffect')

    // It is a real knowledge-base artifact others can search.
    const artifacts = store.findByType('analytics')
    expect(artifacts.some(a => a.title.includes('Hermes perf baseline'))).toBe(true)
  })

  it('returns null when no baseline exists', () => {
    expect(getLatestPerfBaseline(store, 'missing')).toBeNull()
  })

  it('trims baselines beyond the per-label cap', () => {
    const analysis = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(100) })
    for (let i = 0; i < 12; i++) {
      recordPerfBaseline(store, analysis, 'trimme')
    }
    const kept = store.findByType('analytics').filter(a => a.meta?.label === 'trimme')
    expect(kept.length).toBeLessThanOrEqual(10)
  })

  it('flags a blocking-time regression vs the stored baseline', () => {
    const baselineAnalysis = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(200) })
    recordPerfBaseline(store, baselineAnalysis, 'main')
    const stored = getLatestPerfBaseline(store, 'main')!

    // +200% blocking (600ms vs 200ms) — way over the 25% threshold.
    const worse = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(600) })
    const compare = compareToBaseline(worse, stored)
    expect(compare.regressions.length).toBe(1)
    expect(compare.regressions[0].category).toBe('regression')
    expect(compare.regressions[0].message).toContain('grew 200%')
    expect(compare.deltas.blockingPct).toBeCloseTo(200, 0)
  })

  it('stays silent when the runtime improved', () => {
    const baselineAnalysis = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(600) })
    recordPerfBaseline(store, baselineAnalysis, 'main')
    const stored = getLatestPerfBaseline(store, 'main')!

    const better = analyzeHermesRuntime({ cpuProfile: cpuProfileFixture(150) })
    const compare = compareToBaseline(better, stored)
    expect(compare.regressions).toEqual([])
  })

  it('flags retained-memory growth from a heap snapshot', () => {
    const baseline = analyzeHermesRuntime({ heapSnapshot: heapSnapshotFixture() })
    recordPerfBaseline(store, baseline, 'heap')
    const stored = getLatestPerfBaseline(store, 'heap')!

    // Double the retained bytes: same shape, bigger payload (40 MB).
    const bigger = heapSnapshotFixture()
    const nodes = bigger.nodes as number[]
    nodes[2 * 7 + 3] = 40 * 1024 * 1024 // bigPayload self_size at node 2, field 3
    const worse = analyzeHermesRuntime({ heapSnapshot: bigger })
    const compare = compareToBaseline(worse, stored)
    expect(compare.regressions.some(r => r.message.includes('Retained heap grew'))).toBe(true)
  })
})

describe('pctGrowth', () => {
  it('returns null for a zero/missing baseline', () => {
    expect(pctGrowth(0, 10)).toBeNull()
  })
  it('computes positive and negative growth', () => {
    expect(pctGrowth(100, 150)).toBe(50)
    expect(pctGrowth(100, 75)).toBe(-25)
  })
})

describe('summarizeAnalysis', () => {
  it('caps summary values from a full analysis', () => {
    const analysis = analyzeHermesRuntime({
      cpuProfile: cpuProfileFixture(300),
      heapSnapshot: heapSnapshotFixture(),
    })
    const summary = summarizeAnalysis(analysis, 'release')
    expect(summary.label).toBe('release')
    expect(summary.totalBlockingMs).toBe(300)
    expect(summary.totalRetainedBytes).toBeGreaterThan(20 * 1024 * 1024)
    expect(summary.topRetainedObject).toBe('imageCache')
  })
})
