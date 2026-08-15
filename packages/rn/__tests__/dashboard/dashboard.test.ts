/**
 * vectalon dashboard — Engineering Dashboard (Roadmap 079) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { runDashboard, collectAgentReports, renderDashboardHtml, writeDashboardReport, extractFindings } from '../../src/dashboard'
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
