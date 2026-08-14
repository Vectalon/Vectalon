/**
 * vectalon dashboard — Engineering Dashboard (Roadmap Phase 9, item 079)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reads every docs/vectalon/<agent>/report.json and renders a single
 * executive dashboard: per-agent health cards, an overall verdict, and a
 * self-contained HTML report (no external assets). Reports to
 * docs/vectalon/dashboard/ (gitignored).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { runReleaseReady } from '../releaseReady'
import { runArchScore } from '../archScore'
import { runSoc2Scan } from '../soc2'
import type { DashboardAgent, DashboardOptions, DashboardReport } from './types'

export type { DashboardAgent, DashboardOptions, DashboardReport } from './types'

/** Where dashboard reports are written. */
export const dashboardDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'dashboard')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/["]/g, '&quot;')
}

/** Collect existing agent reports under docs/vectalon/<agent>/report.json. */
export function collectAgentReports(root: string): { agent: string; report: Record<string, unknown>; file: string }[] {
  const base = join(root, 'docs', 'vectalon')
  const out: { agent: string; report: Record<string, unknown>; file: string }[] = []
  if (!existsSync(base)) return out
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const reportFile = join(base, entry.name, 'report.json')
    if (!existsSync(reportFile)) continue
    try {
      const report = JSON.parse(readFileSync(reportFile, 'utf-8')) as Record<string, unknown>
      out.push({ agent: entry.name, report, file: reportFile })
    } catch { /* unreadable report — skip */ }
  }
  return out.sort((a, b) => a.agent.localeCompare(b.agent))
}

function severitiesOf(report: Record<string, unknown>): { errors: number; warnings: number; infos: number; total: number } {
  const findings = report.findings as { severity?: string }[] | undefined
  const summary = report.summary as { bySeverity?: Record<string, number>; total?: number } | undefined
  const bySeverity = summary?.bySeverity ?? {}
  const count = (sev: string) => findings?.filter(f => f.severity === sev).length ?? bySeverity[sev] ?? 0
  const total = summary?.total ?? findings?.length ?? 0
  return { errors: count('error'), warnings: count('warning'), infos: count('info'), total }
}

/** Run one dashboard generation. */
export async function runDashboard(root: string, options: DashboardOptions = {}): Promise<DashboardReport> {
  const generatedAt = Date.now()
  if (options.run) {
    // Fast, read-only core reports so the dashboard is never empty.
    await runReleaseReady(root)
    runArchScore(root)
    runSoc2Scan(root)
  }
  const reports = collectAgentReports(root)
  const agents: DashboardAgent[] = reports.map(({ agent, report, file }) => ({
    agent,
    verdict: String(report.verdict ?? 'unknown'),
    ...severitiesOf(report),
    reportFile: relative(root, file).replace(/\\/g, '/'),
  }))
  const errors = agents.reduce((a, x) => a + x.errors, 0)
  const warnings = agents.reduce((a, x) => a + x.warnings, 0)
  const infos = agents.reduce((a, x) => a + x.infos, 0)
  const overall: DashboardReport['overall'] = errors > 0 ? 'changes-requested' : warnings > 0 ? 'needs-attention' : 'approved'
  return {
    generatedAt,
    root,
    agents,
    overall,
    summary: { agents: agents.length, findings: agents.reduce((a, x) => a + x.total, 0), errors, warnings, infos },
  }
}

/** Self-contained HTML dashboard. */
export function renderDashboardHtml(report: DashboardReport): string {
  const cards = report.agents.map(a => {
    const cls = a.verdict === 'approved' ? 'ok' : a.verdict === 'needs-attention' ? 'warn' : 'bad'
    return `<div class="card ${cls}"><h3>${escapeHtml(a.agent)}</h3><div class="verdict">${escapeHtml(a.verdict)}</div>` +
      `<div class="counts"><span class="err">${a.errors} err</span> <span class="warn">${a.warnings} warn</span> <span class="info">${a.infos} info</span></div>` +
      (a.reportFile ? `<div class="file">${escapeHtml(a.reportFile)}</div>` : '') + `</div>`
  }).join('\n')
  const pct = report.summary.agents > 0 ? Math.round((report.agents.filter(a => a.verdict === 'approved').length / report.summary.agents) * 100) : 0
  return `<!doctype html><html><head><meta charset="utf-8"><title>Engineering Dashboard</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0f1115;color:#e6e8eb;padding:32px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;color:#9aa4b2;font-weight:500;margin:0 0 24px}
.overall{display:flex;gap:24px;align-items:center;margin-bottom:28px}
.big{font-size:44px;font-weight:700}${report.overall === 'approved' ? '.big{color:#3fb950}' : report.overall === 'needs-attention' ? '.big{color:#d29922}' : '.big{color:#f85149}'}
.meta{color:#9aa4b2;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.card{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:14px}
.card.ok{border-left:3px solid #3fb950}.card.warn{border-left:3px solid #d29922}.card.bad{border-left:3px solid #f85149}
h3{margin:0 0 8px;font-size:14px}.verdict{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9aa4b2;margin-bottom:10px}
.counts{font-size:12px}.counts .err{color:#f85149}.counts .warn{color:#d29922}.counts .info{color:#58a6ff}
.file{font-size:11px;color:#6e7681;margin-top:8px;word-break:break-all}
.empty{color:#9aa4b2;font-size:14px}
</style></head><body><h1>Engineering Dashboard</h1><h2>Vectalon agent reports — ${escapeHtml(report.root)}</h2>
<div class="overall"><div class="big">${pct}%</div><div class="meta">${report.summary.agents} agents · ${report.summary.findings} findings<br>${report.summary.errors} errors · ${report.summary.warnings} warnings · ${report.summary.infos} infos<br>Overall: <b>${report.overall}</b></div></div>
<div class="grid">${cards || '<div class="empty">No agent reports found — run `vectalon dashboard --run` to generate the core set.</div>'}</div>
</body></html>`
}

/** Render the executive summary as markdown. */
export function renderDashboardMarkdown(report: DashboardReport): string {
  const lines = ['# Engineering Dashboard', '']
  lines.push(`Overall: **${report.overall}**  ·  ${report.summary.agents} agents, ${report.summary.findings} findings (${report.summary.errors} errors, ${report.summary.warnings} warnings)`, '')
  lines.push('', '| Agent | Verdict | Errors | Warnings | Info |', '|---|---|---|---|---|')
  for (const a of report.agents) lines.push(`| ${a.agent} | ${a.verdict} | ${a.errors} | ${a.warnings} | ${a.infos} |`)
  lines.push('')
  const worst = report.agents.filter(a => a.errors > 0).map(a => a.agent)
  if (worst.length > 0) lines.push(`Needs action: ${worst.join(', ')}`, '')
  return lines.join('\n')
}

/** Write markdown + JSON + HTML. */
export function writeDashboardReport(root: string, report: DashboardReport): { mdPath: string; jsonPath: string; htmlPath: string } {
  const dir = dashboardDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderDashboardMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const html = renderDashboardHtml(report)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  const htmlPath = join(dir, 'report.html')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  writeFileSync(htmlPath, html, 'utf-8')
  return { mdPath, jsonPath, htmlPath }
}
