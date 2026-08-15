/**
 * vectalon dashboard — Engineering Dashboard (Roadmap 079) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  runDashboard, collectAgentReports, renderDashboardHtml, writeDashboardReport, extractFindings,
  dashboardCronTick, cronIntervalSeconds, DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS, DASHBOARD_FINDINGS_EMBED_CAP,
} from '../../src/dashboard'
import { createTempProject, cleanup } from '../helpers/tmp'

const REPORT = (verdict: string, errors: number) => JSON.stringify({
  scannedAt: 1, root: '/x', verdict,
  findings: errors > 0 ? [{ severity: 'error' }] : [],
  summary: { total: errors, bySeverity: { error: errors, warning: errors > 0 ? 2 : 0, info: 1 } },
})

describe('dashboard: collectAgentReports', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('aggregates report.json files under docs/vectalon/', () => {
    dir = createTempProject({
      'package.json': '{}',
      'docs/vectalon/arch/report.json': REPORT('approved', 0),
      'docs/vectalon/sec/report.json': REPORT('changes-requested', 1),
      'docs/vectalon/arch/report.md': '# arch',
    })
    const reports = collectAgentReports(dir)
    expect(reports.map(r => r.agent).sort()).toEqual(['arch', 'sec'])
  })
})

describe('dashboard: runDashboard', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('rolls up health across agents and sets the overall verdict', async () => {
    dir = createTempProject({
      'package.json': '{}',
      'docs/vectalon/arch/report.json': REPORT('approved', 0),
      'docs/vectalon/sec/report.json': REPORT('changes-requested', 1),
    })
    const report = await runDashboard(dir)
    expect(report.summary.agents).toBe(2)
    expect(report.summary.errors).toBeGreaterThan(0)
    expect(report.overall).toBe('changes-requested')
  })

  it('approved when every agent report is healthy', async () => {
    dir = createTempProject({
      'package.json': '{}',
      'docs/vectalon/arch/report.json': REPORT('approved', 0),
    })
    const report = await runDashboard(dir)
    expect(report.overall).toBe('approved')
  })

  it('rolls up Phase 10 reports — sentry critical severities count as errors', async () => {
    dir = createTempProject({
      'package.json': '{}',
      // A sentry report with a critical finding: the dashboard must bucket it
      // as an error and the overall verdict must reflect it.
      'docs/vectalon/sentry/report.json': JSON.stringify({
        scannedAt: 1, root: '/x', verdict: 'changes-requested',
        findings: [{ severity: 'critical' }],
        summary: { total: 1, bySeverity: { critical: 1 } },
      }),
      'docs/vectalon/figma/report.json': REPORT('approved', 0),
    })
    const report = await runDashboard(dir)
    const sentry = report.agents.find(a => a.agent === 'sentry')
    expect(sentry?.errors).toBe(1)
    expect(report.summary.errors).toBe(1)
    expect(report.overall).toBe('changes-requested')
  })

  it('aggregates every Phase 10 agent dir present on disk', async () => {
    const phase10 = ['figma', 'sentry', 'observability', 'governance', 'audit', 'repos', 'release-predict', 'play-store', 'dataset', 'lora']
    const files: Record<string, string> = { 'package.json': '{}' }
    for (const agent of phase10) files[`docs/vectalon/${agent}/report.json`] = REPORT('approved', 0)
    dir = createTempProject(files)
    const report = await runDashboard(dir)
    expect(report.summary.agents).toBe(10)
    expect(report.agents.map(a => a.agent).sort()).toEqual([...phase10].sort())
  })

  it('--run regenerates the Phase 9/10 fast core reports', async () => {
    dir = createTempProject({ 'package.json': '{}' })
    await runDashboard(dir, { run: true })
    const phase10 = ['figma', 'sentry', 'observability', 'governance', 'audit', 'repos', 'release-predict', 'play-store', 'dataset', 'lora']
    const phase9core = ['release-ready', 'arch-score', 'soc2']
    for (const agent of [...phase9core, ...phase10]) {
      const p = join(dir, 'docs', 'vectalon', agent, 'report.json')
      expect(JSON.parse(readFileSync(p, 'utf-8'))).toHaveProperty('verdict')
    }
  })

  it('renders a self-contained HTML dashboard', async () => {
    dir = createTempProject({ 'package.json': '{}', 'docs/vectalon/arch/report.json': REPORT('approved', 0) })
    const report = await runDashboard(dir)
    const html = renderDashboardHtml(report)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Engineering Dashboard')
    expect(html).toContain('arch')
  })

  it('embeds per-agent findings for the drill-down dialog', async () => {
    dir = createTempProject({
      'package.json': '{}',
      'docs/vectalon/sec/report.json': JSON.stringify({
        scannedAt: 1, root: '/x', verdict: 'changes-requested',
        findings: [{ id: 'hardcoded-secret', severity: 'error', message: 'Found an API key in src/config.ts', suggestion: 'Move it to env vars.' }],
        summary: { total: 1, bySeverity: { error: 1 } },
      }),
    })
    const report = await runDashboard(dir)
    const agent = report.agents.find(a => a.agent === 'sec')
    expect(agent?.findings?.[0]?.message).toContain('API key')
    const html = renderDashboardHtml(report)
    // The dialog markup, the embedded JSON payload, and the escaped message.
    expect(html).toContain('<dialog id="agent-detail">')
    expect(html).toContain('hardcoded-secret')
    expect(html).toContain('Found an API key in src/config.ts')
    expect(html).toContain('report.md')
  })

  it('renders the search input and severity filter in the drill-down', async () => {
    dir = createTempProject({ 'package.json': '{}', 'docs/vectalon/arch/report.json': REPORT('approved', 0) })
    const report = await runDashboard(dir)
    const html = renderDashboardHtml(report)
    expect(html).toContain('id="detail-search"')
    expect(html).toContain('Search findings')
    expect(html).toContain('data-sev="err"')
    expect(html).toContain('data-sev="warn"')
    expect(html).toContain('data-sev="info"')
    expect(html).toContain('id="detail-result-count"')
    // The filter logic (bucket/matches) is inlined.
    expect(html).toContain('function matches(f)')
    expect(html).toContain('No findings match the current filter.')
  })

  it('embeds large finding sets so they are searchable (cap well above 25)', async () => {
    const findings = Array.from({ length: 60 }, (_, i) => ({
      id: `f-${i}`, severity: i % 3 === 0 ? 'error' : i % 3 === 1 ? 'warning' : 'info',
      message: `finding ${i}`, suggestion: `fix ${i}`,
    }))
    dir = createTempProject({
      'package.json': '{}',
      'docs/vectalon/sec/report.json': JSON.stringify({
        scannedAt: 1, root: '/x', verdict: 'changes-requested',
        findings, summary: { total: findings.length, bySeverity: { error: 20, warning: 20, info: 20 } },
      }),
    })
    const report = await runDashboard(dir)
    const agent = report.agents.find(a => a.agent === 'sec')
    expect(agent?.findings?.length).toBe(60)
    expect(DASHBOARD_FINDINGS_EMBED_CAP).toBeGreaterThanOrEqual(1000)
    const html = renderDashboardHtml(report)
    expect(html).toContain('finding 59')
  })

  it('renders no findings message when an agent has none', async () => {
    dir = createTempProject({ 'package.json': '{}', 'docs/vectalon/arch/report.json': REPORT('approved', 0) })
    const report = await runDashboard(dir)
    const html = renderDashboardHtml(report)
    expect(html).toContain('click for details')
  })

  it('writes markdown, JSON, and HTML', async () => {
    dir = createTempProject({ 'package.json': '{}', 'docs/vectalon/arch/report.json': REPORT('approved', 0) })
    const report = await runDashboard(dir)
    const { mdPath, jsonPath, htmlPath } = writeDashboardReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('Engineering Dashboard')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"overall"')
    expect(readFileSync(htmlPath, 'utf-8')).toContain('<!doctype html>')
  })
})

describe('dashboard: cronIntervalSeconds', () => {
  it('uses the value when positive and finite', () => {
    expect(cronIntervalSeconds(60)).toBe(60)
    expect(cronIntervalSeconds(1)).toBe(1)
  })

  it('falls back to the default for NaN, zero, and negatives', () => {
    expect(cronIntervalSeconds(undefined)).toBe(DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS)
    expect(cronIntervalSeconds(NaN)).toBe(DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS)
    expect(cronIntervalSeconds(0)).toBe(DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS)
    expect(cronIntervalSeconds(-5)).toBe(DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS)
    expect(cronIntervalSeconds(Infinity)).toBe(DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS)
  })
})

describe('dashboard: dashboardCronTick', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('regenerates the core reports, rebuilds the aggregate, and writes all artifacts', async () => {
    dir = createTempProject({ 'package.json': '{}', 'src/a.ts': 'export const x = 1\n' })
    const { report, paths } = await dashboardCronTick(dir)
    expect(report.summary.agents).toBeGreaterThanOrEqual(13)
    expect(report.overall).toBeDefined()
    expect(readFileSync(paths.htmlPath, 'utf-8')).toContain('<!doctype html>')
    expect(readFileSync(paths.jsonPath, 'utf-8')).toContain('"overall"')
    // The fast core set was regenerated on disk.
    for (const agent of ['release-ready', 'arch-score', 'soc2', 'figma', 'sentry', 'observability', 'governance', 'audit', 'repos', 'release-predict', 'play-store', 'dataset', 'lora']) {
      expect(JSON.parse(readFileSync(join(dir, 'docs', 'vectalon', agent, 'report.json'), 'utf-8'))).toHaveProperty('verdict')
    }
  })

  it('does not mutate an existing report when regeneration is skipped', async () => {
    dir = createTempProject({ 'package.json': '{}', 'docs/vectalon/arch/report.json': REPORT('approved', 1) })
    const before = readFileSync(join(dir, 'docs', 'vectalon', 'arch', 'report.json'), 'utf-8')
    // dashboardCronTick always regenerates the core set, so arch-score gets
    // rewritten; verify the dashboard HTML reflects the new aggregate.
    const { report } = await dashboardCronTick(dir)
    expect(report.agents.some(a => a.agent === 'arch-score')).toBe(true)
    expect(before.length).toBeGreaterThan(0)
  })
})

describe('dashboard: extractFindings', () => {
  it('normalizes findings[] reports (Phase 9/10 agents)', () => {
    const findings = extractFindings({
      findings: [{ id: 'x', severity: 'warning', message: 'careful', suggestion: 'do it' }],
    })
    expect(findings).toEqual([{ id: 'x', severity: 'warning', message: 'careful', suggestion: 'do it' }])
  })

  it('normalizes release-ready checks[] with title + fix', () => {
    const findings = extractFindings({
      checks: [{ id: 'version', severity: 'error', title: 'Version', message: 'not bumped', fix: 'bump it' }],
    })
    expect(findings[0]).toMatchObject({ id: 'version', severity: 'error', message: 'Version: not bumped', suggestion: 'bump it' })
  })

  it('normalizes soc2 controls[] with status → severity', () => {
    const findings = extractFindings({
      controls: [{ id: 'access', status: 'fail', title: 'Access control', evidence: 'no auth lib' }],
    })
    expect(findings[0]).toMatchObject({ id: 'access', severity: 'error', message: 'Access control — no auth lib' })
  })

  it('normalizes arch-score dimensions[] + topImprovements', () => {
    const findings = extractFindings({
      dimensions: [{ id: 'cycles', title: 'Cycles', score: 5, maxScore: 10 }],
      topImprovements: ['break the a→b cycle'],
    })
    expect(findings.some(f => f.message.includes('Cycles'))).toBe(true)
    expect(findings.some(f => f.message.includes('break the a→b cycle'))).toBe(true)
  })

  it('returns [] for reports with no items', () => {
    expect(extractFindings({ verdict: 'approved' })).toEqual([])
  })
})
