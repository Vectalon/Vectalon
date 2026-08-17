/**
 * Data-drift guard for the /benchmarks page: every number on the page must
 * match the committed benchmark artifacts in the RN package —
 *   packages/rn/bench/results/local.json   (nightly model pass)
 *   packages/rn/bench/baseline.json        (CI regression gate)
 * If a nightly leaderboard updates local.json / BENCHMARK_RESULTS.md and the
 * page is not regenerated, this test fails in CI — the page's header comment
 * says "never edit by hand", and this is the enforcement.
 *
 * Parses both sources directly (plain fs, no cross-package imports).
 */
import * as fs from 'fs'
import * as path from 'path'

const PAGE = path.resolve(__dirname, '../app/benchmarks/page.tsx')
// apps/website/__tests__ → repo root is three levels up
const LOCAL = path.resolve(__dirname, '../../../packages/rn/bench/results/local.json')
const BASELINE = path.resolve(__dirname, '../../../packages/rn/bench/baseline.json')

const pct = (v: number | null | undefined): number | null => (typeof v === 'number' ? Math.round(v * 100) : null)

interface PageRun {
  composite: number | null
  correctness: number | null
  adherence: number | null
  guardrails: number | null
  relative: number | null
}

/** Extract the RUNS array from the page source, keyed by scenario id. */
function pageRuns(source: string): Record<string, PageRun> {
  const out: Record<string, PageRun> = {}
  const re =
    /id:\s*'(rn-\d+)'.*?composite:\s*(\d+|null),\s*correctness:\s*(\d+|null),\s*adherence:\s*(\d+|null),\s*guardrails:\s*(\d+|null),\s*relative:\s*(\d+|null)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const num = (i: number): number | null => (m![i] === 'null' ? null : Number(m![i]))
    out[m[1]] = {
      composite: num(2),
      correctness: num(3),
      adherence: num(4),
      guardrails: num(5),
      relative: num(6),
    }
  }
  return out
}

/** Extract the SUITES array: name → { composite, guardrails }. */
function pageSuites(source: string): Record<string, { composite: number | null; guardrails: number | null }> {
  const out: Record<string, { composite: number | null; guardrails: number | null }> = {}
  const re = /name:\s*'([a-z0-9-]+)',\s*composite:\s*(\d+|null),\s*guardrails:\s*(\d+|null)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    out[m[1]] = { composite: m[2] === 'null' ? null : Number(m[2]), guardrails: m[3] === 'null' ? null : Number(m[3]) }
  }
  return out
}

describe('benchmarks page data', () => {
  const page = fs.readFileSync(PAGE, 'utf-8')
  const local = JSON.parse(fs.readFileSync(LOCAL, 'utf-8'))
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf-8'))

  it('shows every scenario with the exact committed per-axis scores', () => {
    const runs = pageRuns(page)
    expect(Object.keys(runs).length).toBe(35)
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
    const suites = pageSuites(page)
    expect(Object.keys(suites).length).toBe(18)
    for (const s of local.suites as Array<Record<string, unknown>>) {
      const name = s.suite as string
      expect(suites[name].composite).toBe(pct(s.composite as number | null))
      expect(suites[name].guardrails).toBe(pct(s.guardrails as number | null))
    }
  })

  it('shows the committed overall numbers (composite / guardrails / relative-to-human)', () => {
    // Hero stats rendered as literal percentages in the stat cards.
    expect(page).toContain('stat-value text-brand">79%')
    expect(page).toContain('stat-value text-brand">89%')
    expect(page).toContain('stat-value text-brand">92%')
    // And the human reference composite that 92% is relative to.
    expect(page).toContain('87% human reference composite')
    expect(pct(local.overallComposite)).toBe(79)
    expect(pct(local.overallGuardrails)).toBe(89)
    expect(pct(local.overallReferenceComposite)).toBe(87)
    expect(pct(local.overallRelativeComposite)).toBe(92)
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
    // The page must gate exactly those nine scenarios, in order.
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
    ])
  })
})
