import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import {
  bucketCrashSeries,
  deriveAnomalyBaseline,
  detectCrashAnomaly,
  recordCrashBaseline,
  getLatestCrashBaseline,
  monitorReleaseAnomaly,
  renderAnomalyReport,
} from '../../src/sdlc/CrashAnomalyDetector'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { ParsedCrash } from '../../src/knowledge/telemetry'

const HOUR = 3600_000

function crash(overrides: Partial<ParsedCrash> = {}): ParsedCrash {
  return {
    kind: 'crash',
    id: 'c1',
    source: 'crashlytics',
    exceptionType: 'NSInvalidArgumentException',
    message: 'null is not an object',
    release: '1.3.0',
    timestamp: Date.now() - 24 * HOUR,
    frames: [],
    ...overrides,
  }
}

/** A series with `count` crashes in bucket `hour` (0 = earliest). */
function crashAt(hour: number, count: number, base: number = Date.now() - 24 * HOUR): ParsedCrash[] {
  return Array.from({ length: count }, (_, i) =>
    crash({ id: `h${hour}-${i}`, timestamp: base + hour * HOUR })
  )
}

describe('bucketCrashSeries', () => {
  it('buckets timestamped crashes into hourly windows with normalized rates', () => {
    const crashes = [
      ...crashAt(0, 2),
      ...crashAt(1, 1),
      ...crashAt(3, 1),
    ]
    const series = bucketCrashSeries(crashes, { bucketHours: 1 })
    expect(series.map(s => s.count)).toEqual([2, 1, 1])
    // rate = count / (bucketHours/24) / sessions * 1000, sessions=1000 → count * 24
    expect(series[0].rate).toBeCloseTo(48, 5)
    expect(series[1].rate).toBeCloseTo(24, 5)
    // Buckets are ordered by time, not insertion order.
    expect(series[2].bucketStart).toBeGreaterThan(series[1].bucketStart)
  })

  it('skips crashes without timestamps', () => {
    const series = bucketCrashSeries([crash({ timestamp: undefined }), ...crashAt(0, 1)])
    expect(series.length).toBe(1)
  })

  it('supports custom bucket sizes and session volumes', () => {
    const series = bucketCrashSeries(crashAt(0, 1), { bucketHours: 2, sessions: 500 })
    // 1 crash over 2h / 500 sessions * 1000 → 1 / (2/24) / 500 * 1000 = 24
    expect(series[0].rate).toBeCloseTo(24, 5)
  })
})

describe('deriveAnomalyBaseline', () => {
  it('returns null when there is not enough history', () => {
    const series = bucketCrashSeries([...crashAt(0, 1), ...crashAt(1, 1)], { bucketHours: 1 })
    expect(deriveAnomalyBaseline(series, { minSamples: 5 })).toBeNull()
  })

  it('computes mean and stdDev over historical buckets', () => {
    const series = bucketCrashSeries(
      [...crashAt(0, 2), ...crashAt(1, 2), ...crashAt(2, 2), ...crashAt(3, 2), ...crashAt(4, 2), ...crashAt(5, 2)],
      { bucketHours: 1 }
    )
    const baseline = deriveAnomalyBaseline(series, { minSamples: 5 })
    expect(baseline).not.toBeNull()
    // History excludes the latest bucket: five buckets of 48/1k → mean 48, σ 0.
    expect(baseline?.mean).toBeCloseTo(48, 5)
    expect(baseline?.stdDev).toBeCloseTo(0, 5)
    expect(baseline?.sampleCount).toBe(5)
  })
})

describe('detectCrashAnomaly', () => {
  it('reports healthy when there are no crashes', () => {
    const result = detectCrashAnomaly([])
    expect(result.detected).toBe(false)
    expect(result.action).toBe('ok')
    expect(result.zScore).toBeNull()
  })

  it('watches when crashes lack timestamps', () => {
    const result = detectCrashAnomaly([crash({ timestamp: undefined }), crash({ timestamp: undefined })])
    expect(result.detected).toBe(false)
    expect(result.action).toBe('watch')
    expect(result.message).toContain('without timestamps')
  })

  it('watches when history is too thin for a baseline', () => {
    const result = detectCrashAnomaly([...crashAt(0, 1), ...crashAt(1, 5)], { minSamples: 5 })
    expect(result.detected).toBe(false)
    expect(result.action).toBe('watch')
    expect(result.message).toContain('not enough history')
  })

  it('flags a spike above baseline + n·stdDev', () => {
    // 10 steady buckets of 1 crash (rate 24), then a spike of 12 crashes (rate 288).
    const crashes = [
      ...Array.from({ length: 10 }, (_, i) => crashAt(i, 1)),
      ...crashAt(10, 12),
    ].flat()
    const result = detectCrashAnomaly(crashes, { minSamples: 5 })
    expect(result.detected).toBe(true)
    expect(result.action).toBe('rollback')
    expect(result.zScore).not.toBeNull()
    expect(result.zScore as number).toBeGreaterThanOrEqual(3)
    expect(result.message).toContain('recommend rollback')
    // Baseline was derived from the 10 steady buckets (mean 24, σ 0 → ∞ z).
    expect(result.baseline?.mean).toBeCloseTo(24, 5)
  })

  it('respects an explicit baseline instead of deriving one', () => {
    const crashes = [...crashAt(0, 1), ...crashAt(1, 6)].flat()
    const result = detectCrashAnomaly(crashes, {
      minSamples: 5,
      baseline: { mean: 24, stdDev: 4, sampleCount: 10, capturedAt: 1, windowHours: 24, bucketHours: 1 },
    })
    expect(result.detected).toBe(true)
    // z = (144 − 24) / 4 = 30
    expect(result.zScore).toBeCloseTo(30, 0)
  })

  it('stays healthy within the threshold', () => {
    const crashes = Array.from({ length: 10 }, (_, i) => crashAt(i, 1)).flat()
    const result = detectCrashAnomaly(crashes, { minSamples: 5 })
    expect(result.detected).toBe(false)
    expect(result.action).toBe('ok')
    expect(result.message).toContain('within threshold')
  })
})

describe('knowledge-base baseline persistence', () => {
  let dir: string
  let store: ArtifactStore

  beforeEach(() => {
    dir = createTempProject({})
    store = new ArtifactStore(dir, { engine: 'json' })
  })

  afterEach(() => {
    store.close()
    cleanup(dir)
  })

  it('round-trips a baseline through the artifact store', () => {
    expect(getLatestCrashBaseline(store)).toBeNull()
    const baseline = { mean: 31.2, stdDev: 8.4, sampleCount: 12, capturedAt: Date.now(), windowHours: 24, bucketHours: 1 }
    const previous = recordCrashBaseline(store, baseline)
    expect(previous).toBeNull()

    const loaded = getLatestCrashBaseline(store)
    expect(loaded).not.toBeNull()
    expect(loaded?.mean).toBeCloseTo(baseline.mean, 9)
    expect(loaded?.stdDev).toBeCloseTo(baseline.stdDev, 9)
    expect(loaded?.sampleCount).toBe(12)
    expect(loaded?.windowHours).toBe(24)
    expect(loaded?.bucketHours).toBe(1)
  })

  it('returns the most recent baseline and trims beyond the cap', () => {
    for (let i = 0; i < 12; i++) {
      recordCrashBaseline(store, {
        mean: 10 + i,
        stdDev: 1,
        sampleCount: 5,
        capturedAt: 1 + i,
        windowHours: 24,
        bucketHours: 1,
      })
    }
    const latest = getLatestCrashBaseline(store)
    expect(latest?.mean).toBeCloseTo(21, 9)
    // 12 recorded − 10 kept = 2 trimmed.
    expect(store.list().filter(a => a.meta?.kind === 'crash-rate-baseline').length).toBe(10)
  })
})

describe('monitorReleaseAnomaly', () => {
  it('files an incident with a rollback suggestion on a spike', () => {
    const crashes = [
      ...Array.from({ length: 10 }, (_, i) => crashAt(i, 1)),
      ...crashAt(10, 12),
    ].flat()
    const result = monitorReleaseAnomaly(crashes, { minSamples: 5 })
    expect(result.result.detected).toBe(true)
    expect(result.incident).not.toBeNull()
    expect(result.incident?.title).toContain('Crash-rate anomaly')
    expect(['sev1', 'sev2', 'sev3']).toContain(result.incident?.severity)
    expect(result.report).toContain('Auto-filed incident')
    expect(result.report).toContain('Suggested action: roll back the release.')
    expect(renderAnomalyReport(result.result, result.incident)).toBe(result.report)
  })

  it('does not file an incident when healthy', () => {
    const crashes = Array.from({ length: 10 }, (_, i) => crashAt(i, 1)).flat()
    const result = monitorReleaseAnomaly(crashes, { minSamples: 5 })
    expect(result.result.detected).toBe(false)
    expect(result.incident).toBeNull()
    expect(result.report).toContain('No incident filed')
  })

  it('persists a baseline on healthy windows and keeps it on spikes', () => {
    const dir = createTempProject({})
    const store = new ArtifactStore(dir, { engine: 'json' })
    try {
      const healthy = Array.from({ length: 10 }, (_, i) => crashAt(i, 1)).flat()
      monitorReleaseAnomaly(healthy, { minSamples: 5 }, store)
      const stored = getLatestCrashBaseline(store)
      expect(stored).not.toBeNull()
      expect(stored?.mean).toBeCloseTo(24, 5)

      // A spike must NOT overwrite the healthy baseline — the gate stays strict.
      const spike = [...Array.from({ length: 10 }, (_, i) => crashAt(i, 1)), ...crashAt(10, 12)].flat()
      monitorReleaseAnomaly(spike, { minSamples: 5 }, store)
      expect(getLatestCrashBaseline(store)?.mean).toBeCloseTo(24, 5)
    } finally {
      store.close()
      cleanup(dir)
    }
  })

  it('learns: a richer derived baseline replaces the stored one on a healthy window', () => {
    const dir = createTempProject({})
    const store = new ArtifactStore(dir, { engine: 'json' })
    try {
      // Stored baseline with few samples (a single early run).
      recordCrashBaseline(store, { mean: 10, stdDev: 2, sampleCount: 1, capturedAt: 1, windowHours: 24, bucketHours: 1 })
      // A healthy window with 10 steady buckets derives a richer baseline
      // (9 history samples > 1) — monitorReleaseAnomaly must prefer it.
      const healthy = Array.from({ length: 10 }, (_, i) => crashAt(i, 1)).flat()
      monitorReleaseAnomaly(healthy, { minSamples: 5 }, store)
      const learned = getLatestCrashBaseline(store)
      expect(learned?.sampleCount).toBe(9)
      expect(learned?.mean).toBeCloseTo(24, 5)
    } finally {
      store.close()
      cleanup(dir)
    }
  })
})
