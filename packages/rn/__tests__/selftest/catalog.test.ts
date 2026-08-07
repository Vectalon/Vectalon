import { FEATURE_CATALOG, listFeatureChecks, getFeatureCheck, categorizeChecks } from '../../src/selftest/catalog'
import { runSelfTest } from '../../src/selftest/runner'

describe('feature catalog', () => {
  it('has unique, well-formed check ids', () => {
    const ids = FEATURE_CATALOG.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const check of FEATURE_CATALOG) {
      expect(check.id).toMatch(/^[a-z0-9-]+$/)
      expect(check.name.length).toBeGreaterThan(0)
      expect(check.description.length).toBeGreaterThan(0)
      expect(typeof check.run).toBe('function')
      expect(check.category).toMatch(
        /^(cli|sdlc|guardrails|knowledge|harness|model|mcp|workflows|ecosystem|bench|adapters|memory|upgrade|perf)$/
      )
    }
  })

  it('covers every category with at least one check', () => {
    const grouped = categorizeChecks(FEATURE_CATALOG)
    expect(Object.keys(grouped).sort()).toEqual([
      'adapters',
      'bench',
      'cli',
      'ecosystem',
      'guardrails',
      'harness',
      'knowledge',
      'mcp',
      'memory',
      'model',
      'perf',
      'sdlc',
      'upgrade',
      'workflows',
    ])
  })

  it('supports lookups and filters', () => {
    expect(getFeatureCheck('knowledge-store')?.name).toBe('Artifact store')
    expect(getFeatureCheck('nope')).toBeUndefined()
    const only = listFeatureChecks({ only: 'cli-version' })
    expect(only).toHaveLength(1)
    expect(only[0].id).toBe('cli-version')
    const mcps = listFeatureChecks({ category: 'mcp' })
    expect(mcps.length).toBeGreaterThan(0)
    expect(mcps.every(c => c.category === 'mcp')).toBe(true)
  })
})

describe('running the full catalog (smoke)', () => {
  it('completes and reports a valid shape with no thrown errors', async () => {
    const report = await runSelfTest()
    expect(report.runs).toHaveLength(FEATURE_CATALOG.length)
    expect(report.totals.total).toBe(FEATURE_CATALOG.length)
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/)

    for (const run of report.runs) {
      expect(['pass', 'fail', 'warn']).toContain(run.status)
      expect(run.durationMs).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(run.steps)).toBe(true)
      // A check that throws must surface the error in the report.
      if (run.error) {
        expect(run.status).toBe('fail')
      }
    }

    // The activity trace aggregates real activity.
    expect(report.activity.steps).toBeGreaterThan(0)
  })

  it('core deterministic checks pass', async () => {
    const report = await runSelfTest({ only: 'cli-version' })
    expect(report.totals).toMatchObject({ pass: 1, fail: 0 })
  })

  it('filters by category', async () => {
    const report = await runSelfTest({ category: 'knowledge' })
    expect(report.runs.length).toBeGreaterThan(0)
    expect(report.runs.every(r => r.check.category === 'knowledge')).toBe(true)
  })
})
