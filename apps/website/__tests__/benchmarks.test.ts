/**
 * Data-drift guard for the /benchmarks page: its derived view data must match
 * the committed benchmark artifacts in the RN package —
 *   packages/rn/bench/results/local.json   (nightly model pass)
 *   packages/rn/bench/baseline.json        (CI regression gate)
 * The page consumes local.json directly, so nightly leaderboard updates do not
 * require a second hand-maintained snapshot.
 *
 * Parses both sources directly (plain fs, no cross-package imports).
 */
import * as fs from 'fs'
import * as path from 'path'
import { OVERALL, RUNS, SUITES } from '../lib/benchmarkData'

const PAGE = path.resolve(__dirname, '../app/benchmarks/page.tsx')
const LOCAL = path.resolve(__dirname, '../../../packages/rn/bench/results/local.json')
const BASELINE = path.resolve(__dirname, '../../../packages/rn/bench/baseline.json')

const pct = (v: number | null | undefined): number | null => (typeof v === 'number' ? Math.round(v * 100) : null)

describe('benchmarks page data', () => {
  const page = fs.readFileSync(PAGE, 'utf-8')
  const local = JSON.parse(fs.readFileSync(LOCAL, 'utf-8'))
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf-8'))

  it('shows every scenario with the exact committed per-axis scores', () => {
    const runs = Object.fromEntries(RUNS.map(run => [run.id, run]))
    expect(Object.keys(runs).length).toBe(local.runs.length)
    for (const run of local.runs as Array<Record<string, unknown>>) {
      // local.json keys runs by full id (rn-01-login-screen); the page uses
      // the short scenario id (rn-01) — map one to the other.
      const shortId = (run.id as string).split('-').slice(0, 2).join('-')
      const axes = run.axes as Record<string, number | null>
      const reference = run.reference as { relative?: Record<string, number | null> } | undefined
      const relComposite = reference?.relative?.composite ?? null
      expect(runs[shortId].composite).toBe(pct(run.composite as number | null))
      expect(runs[shortId].correctness).toBe(pct(axes.correctness))
      expect(runs[shortId].adherence).toBe(pct(axes.adherence))
      expect(runs[shortId].guardrails).toBe(pct(axes.guardrails))
      expect(runs[shortId].relative).toBe(pct(relComposite))
    }
  })

  it('shows the suite aggregates from the same run', () => {
    const suites = Object.fromEntries(SUITES.map(suite => [suite.name, suite]))
    expect(Object.keys(suites).length).toBe(local.suites.length)
    for (const s of local.suites as Array<Record<string, unknown>>) {
      const name = s.suite as string
      expect(suites[name].composite).toBe(pct(s.composite as number | null))
      expect(suites[name].guardrails).toBe(pct(s.guardrails as number | null))
    }
  })

  it('shows the committed overall numbers (composite / guardrails / relative-to-human)', () => {
    expect(OVERALL.composite).toBe(pct(local.overallComposite))
    expect(OVERALL.guardrails).toBe(pct(local.overallGuardrails))
    expect(OVERALL.referenceComposite).toBe(pct(local.overallReferenceComposite))
    expect(OVERALL.relativeComposite).toBe(pct(local.overallRelativeComposite))
  })

  it('matches the CI regression gate to the committed baseline', () => {
    const scaffoldable = (baseline.runs as Array<Record<string, unknown>>)
      .filter(r => r.scaffoldable === true)
      .map(r => r.id as string)
    expect(scaffoldable.length).toBe(6)
    for (const id of scaffoldable) {
      const run = (baseline.runs as Array<Record<string, unknown>>).find(r => r.id === id)
      const axes = (run as Record<string, unknown>).axes as Record<string, number | null>
      expect(pct(axes.adherence)).toBe(100)
      expect(pct(axes.guardrails)).toBe(100)
      expect(axes.correctness).toBeNull()
    }
    // The gate also covers the three dependency-removal scenarios, which run
    // deterministically through the removal seam (adherence 100%, guardrails 98%).
    for (const id of ['rn-11-remove-dependency-native', 'rn-34-remove-sentry-sdk', 'rn-35-remove-firebase-sdk']) {
      const removalRun = (baseline.runs as Array<Record<string, unknown>>).find(r => r.id === id)
      expect(removalRun).toBeDefined()
      expect(pct((removalRun as Record<string, unknown>).composite as number)).toBe(99)
      const removalAxes = (removalRun as Record<string, unknown>).axes as Record<string, number | null>
      expect(pct(removalAxes.adherence)).toBe(100)
      expect(pct(removalAxes.guardrails)).toBe(98)
      expect(removalAxes.correctness).toBeNull()
    }
    // The gate covers the eight upgrade/debugging fix scenarios through the
    // fix seam (adherence + guardrails both 100%).
    for (const id of ['rn-36-upgrade-compile-sdk', 'rn-37-upgrade-kotlin-gradle', 'rn-38-upgrade-new-arch', 'rn-39-upgrade-deprecated-api', 'rn-40-debug-metro-resolution', 'rn-41-debug-hermes-crash', 'rn-42-debug-ts-regression', 'rn-43-debug-linking']) {
      const fixRun = (baseline.runs as Array<Record<string, unknown>>).find(r => r.id === id)
      expect(fixRun).toBeDefined()
      expect(pct((fixRun as Record<string, unknown>).composite as number)).toBe(100)
      const fixAxes = (fixRun as Record<string, unknown>).axes as Record<string, number | null>
      expect(pct(fixAxes.adherence)).toBe(100)
      expect(pct(fixAxes.guardrails)).toBe(100)
    }
    // The page must gate exactly those seventeen scenarios, in order.
    const gateMatch = page.match(/const BASELINE_GATE = \[([^\]]+)\]/)
    const gateIds = (gateMatch?.[1].match(/id: '([^']+)'/g) ?? []).map(s =>
      s.replace(/^id: '/, '').replace(/'$/, '')
    )
    expect(gateIds).toEqual([
      'rn-01-login-screen',
      'rn-02-flatlist-fetch',
      'rn-05-form-validation',
      'rn-06-offline-queue',
      'rn-11-remove-dependency-native',
      'rn-12-notifications-screen',
      'rn-13-account-delete-screen',
      'rn-34-remove-sentry-sdk',
      'rn-35-remove-firebase-sdk',
      'rn-36-upgrade-compile-sdk',
      'rn-37-upgrade-kotlin-gradle',
      'rn-38-upgrade-new-arch',
      'rn-39-upgrade-deprecated-api',
      'rn-40-debug-metro-resolution',
      'rn-41-debug-hermes-crash',
      'rn-42-debug-ts-regression',
      'rn-43-debug-linking',
    ])
  })
})
