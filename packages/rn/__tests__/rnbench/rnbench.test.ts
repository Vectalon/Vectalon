/**
 * vectalon rnbench — hermetic tests for the RN Engineering Benchmark.
 * Business Source License 1.1 (BSL-1.1)
 */
import { join } from 'path'
import { DIMENSIONS, dimensionOf, SCENARIO_DIMENSION, shortId, BENCH_VERSION, FIX_BENCH, buildRnnBenchmark } from '../../src/rnbench'

const PKG = join(__dirname, '..', '..')

describe('rnbench dimensions', () => {
  it('publishes exactly the eight engineering dimensions', () => {
    expect(DIMENSIONS.map(d => d.id)).toEqual([
      'architecture',
      'native-integration',
      'dependency-management',
      'testing',
      'performance',
      'security',
      'upgrades',
      'debugging',
    ])
    for (const d of DIMENSIONS) {
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.what.length).toBeGreaterThan(0)
    }
  })

  it('maps every scenario in the pack to exactly one dimension (no orphans, no doubles)', () => {
    // The pack is rn-01..rn-43 — every short id must map, and only once.
    for (let i = 1; i <= 43; i++) {
      const id = `rn-${String(i).padStart(2, '0')}`
      const dim = SCENARIO_DIMENSION[id]
      expect(dim).toBeTruthy()
    }
    // Every value is a real dimension id, and the pack covers 43 scenarios.
    const valid = new Set(DIMENSIONS.map(d => d.id))
    for (const dim of Object.values(SCENARIO_DIMENSION)) expect(valid.has(dim)).toBe(true)
    expect(Object.keys(SCENARIO_DIMENSION)).toHaveLength(43)
    // The upgrade-breakage (rn-36..39) and debugging (rn-40..43) scenarios are
    // now real pack tasks mapped to their dimensions.
    expect(SCENARIO_DIMENSION['rn-36']).toBe('upgrades')
    expect(SCENARIO_DIMENSION['rn-39']).toBe('upgrades')
    expect(SCENARIO_DIMENSION['rn-40']).toBe('debugging')
    expect(SCENARIO_DIMENSION['rn-43']).toBe('debugging')
  })

  it('parses full scenario ids down to their short dimension key', () => {
    expect(shortId('rn-12-notifications-screen')).toBe('rn-12')
    expect(dimensionOf('rn-12-notifications-screen')).toBe('performance')
    expect(dimensionOf('rn-99-nonexistent')).toBeNull()
  })
})

describe('rnbench benchmark build', () => {
  it('builds the full matrix from committed artifacts', () => {
    const bench = buildRnnBenchmark(PKG)
    expect(bench.version).toBe(BENCH_VERSION)
    expect(bench.dimensions).toHaveLength(8)

    // Every dimension has its published scenario list.
    const totalScenarios = bench.dimensions.reduce((a, d) => a + d.scenarios.length, 0)
    expect(totalScenarios).toBe(43)
    // The published counts per dimension.
    const byId = Object.fromEntries(bench.dimensions.map(d => [d.id, d.scenarios.length]))
    expect(byId.upgrades).toBe(4)
    expect(byId.debugging).toBe(4)

    // Tools: Vectalon + 3 generic tiers + human + 5 competitors.
    expect(bench.tools.map(t => t.id)).toEqual([
      'vectalon',
      'generic-7b',
      'generic-3b',
      'generic-15b',
      'human',
      'claude-code',
      'cursor',
      'cline',
      'windsurf',
      'aider',
    ])

    // Competitor rows are honestly pending.
    for (const c of ['claude-code', 'cursor', 'cline', 'windsurf', 'aider']) {
      expect(bench.matrix[c].architecture.value).toBeNull()
      expect(bench.matrix[c].architecture.metric).toBe('pending')
    }
  })

  it('scores the Vectalon row from deterministic seams — upgrades/debugging from the real pack tasks', () => {
    const bench = buildRnnBenchmark(PKG)
    const v = bench.matrix.vectalon
    // Upgrades/debugging now score the REAL pack tasks (rn-36..43) through the
    // committed baseline fix seam — 100 composite, metric fix-rate, not the
    // fix-bench constants.
    expect(v.upgrades.value).toBe(100)
    expect(v.upgrades.metric).toBe('fix-rate')
    expect(v.debugging.value).toBe(100)
    expect(v.debugging.metric).toBe('fix-rate')
    expect(v['dependency-management'].value).toBe(99)
    for (const d of DIMENSIONS) {
      const cell = v[d.id]
      expect(cell.metric).not.toBe('pending')
      expect(cell.value).not.toBeNull()
    }
  })

  it('computes the human row from the same references (never a separate run)', () => {
    const bench = buildRnnBenchmark(PKG)
    const human = bench.matrix.human
    // Human is scored by the same rubric and is not 100%.
    for (const d of DIMENSIONS) {
      const cell = human[d.id]
      if (cell.value !== null) expect(cell.metric).toBe('rubric-composite')
    }
    // The human row must exist for at least the dimensions the 7B quality run covers.
    expect(human.architecture.value).not.toBeNull()
    expect(human.testing.value).not.toBeNull()
  })

  it('keeps the fix-bench constants locked to the committed gate', () => {
    // These are the product-milestone numbers the full-pack hermetic gate locks.
    expect(FIX_BENCH.diagnosis).toBe(100)
    expect(FIX_BENCH.fix).toBe(70)
    expect(FIX_BENCH.falsePositives).toBe(0)
    expect(FIX_BENCH.upgradeSuiteFix).toBe(10)
  })
})
