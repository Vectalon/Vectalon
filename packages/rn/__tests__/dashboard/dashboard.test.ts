/**
 * vectalon dashboard — Engineering Dashboard (Roadmap 079) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { runDashboard, collectAgentReports, renderDashboardHtml, writeDashboardReport } from '../../src/dashboard'
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

  it('renders a self-contained HTML dashboard', async () => {
    dir = createTempProject({ 'package.json': '{}', 'docs/vectalon/arch/report.json': REPORT('approved', 0) })
    const report = await runDashboard(dir)
    const html = renderDashboardHtml(report)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Engineering Dashboard')
    expect(html).toContain('arch')
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
