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
import { dirname, join, relative } from 'path'
import { runReleaseReady, writeReleaseReadyReport } from '../releaseReady'
import { runArchScore, writeArchScoreReport } from '../archScore'
import { runSoc2Scan, writeSoc2Report } from '../soc2'
import { runFigmaSync, writeFigmaReport } from '../figma'
import { runSentryScan, writeSentryReport } from '../sentry'
import { runObsScan, writeObsReport } from '../observability'
import { runGovScan, writeGovReport } from '../governance'
import { runAuditScan, writeAuditReport } from '../audit'
import { runReposScan, writeReposReport } from '../repos'
import { runReleasePredict, writePredictReport } from '../releasePredict'
import { runPlayScan, writePlayReport } from '../playStore'
import { runDatasetScan, writeDatasetReport } from '../dataset'
import { runLoraScan, writeLoraReport } from '../lora'
import type { DashboardAgent, DashboardFinding, DashboardOptions, DashboardReport } from './types'

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
  const bucketOf = (sev: string | undefined): 'error' | 'warning' | 'info' | undefined =>
    sev === 'critical' || sev === 'error' ? 'error' : sev === 'warning' || sev === 'warn' ? 'warning' : sev === 'info' ? 'info' : undefined
  const count = (bucket: 'error' | 'warning' | 'info') =>
    findings ? findings.filter(f => bucketOf(f.severity) === bucket).length : Object.entries(bySeverity).reduce((sum, [sev, n]) => (bucketOf(sev) === bucket ? sum + n : sum), 0)
  const total = summary?.total ?? findings?.length ?? 0
  return { errors: count('error'), warnings: count('warning'), infos: count('info'), total }
}

/**
 * Normalize an agent report's items into findings for the drill-down. Handles
 * the shapes the core agents use: `findings[]` (Phase 9/10 agents),
 * `checks[]` (release-ready), `controls[]` (soc2), and `dimensions[]` +
 * `topImprovements` (arch-score). Always returns a list (possibly empty).
 */
export function extractFindings(report: Record<string, unknown>): DashboardFinding[] {
  const out: DashboardFinding[] = []
  const push = (severity: string, id: unknown, message: unknown, suggestion: unknown) => {
    if (typeof message !== 'string' || message.trim().length === 0) return
    out.push({
      id: typeof id === 'string' ? id : undefined,
      severity,
      message,
      suggestion: typeof suggestion === 'string' ? suggestion : undefined,
    })
  }

  const findings = report.findings as Array<{ id?: unknown; severity?: unknown; message?: unknown; suggestion?: unknown }> | undefined
  if (Array.isArray(findings)) {
    for (const f of findings) {
      push(String(f.severity ?? 'info'), f.id, f.message, f.suggestion)
    }
    return out
  }

  const checks = report.checks as Array<{ id?: unknown; severity?: unknown; title?: unknown; message?: unknown; fix?: unknown }> | undefined
  if (Array.isArray(checks)) {
    for (const c of checks) {
      const title = typeof c.title === 'string' && c.title.trim().length > 0 ? c.title : undefined
      push(String(c.severity ?? 'info'), c.id, title ? `${title}: ${String(c.message ?? '')}` : c.message, c.fix)
    }
    return out
  }

  const controls = report.controls as Array<{ id?: unknown; status?: unknown; title?: unknown; evidence?: unknown; suggestion?: unknown }> | undefined
  if (Array.isArray(controls)) {
    for (const c of controls) {
      const status = String(c.status ?? 'n/a')
      const severity = status === 'fail' ? 'error' : status === 'partial' ? 'warning' : status === 'pass' ? 'info' : 'info'
      const message = `${typeof c.title === 'string' ? c.title : c.id} — ${typeof c.evidence === 'string' && c.evidence.length > 0 ? c.evidence : 'no evidence'}`
      push(severity, c.id, message, c.suggestion)
    }
    return out
  }

  const dimensions = report.dimensions as Array<{ id?: unknown; title?: unknown; score?: unknown; maxScore?: unknown; detail?: unknown }> | undefined
  if (Array.isArray(dimensions)) {
    for (const d of dimensions) {
      const score = typeof d.score === 'number' ? d.score : typeof d.maxScore === 'number' ? d.maxScore : 0
      const max = typeof d.maxScore === 'number' ? d.maxScore : score
      push('info', d.id, `${typeof d.title === 'string' ? d.title : d.id} — score ${score}/${max}`, d.detail)
    }
  }
  const top = report.topImprovements as unknown
  if (Array.isArray(top)) {
    for (const t of top) push('info', undefined, String(t), undefined)
  }
  return out
}

/**
 * Regenerate the fast Phase 9/10 core reports (all deterministic file scans /
 * git reads) and write each to docs/vectalon/<agent>/ so a fresh project gets
 * the full set. Shared by `--run` and the `--cron` loop.
 */
export async function regenerateCoreReports(root: string): Promise<void> {
  writeReleaseReadyReport(root, await runReleaseReady(root))
  writeArchScoreReport(root, runArchScore(root))
  writeSoc2Report(root, runSoc2Scan(root))
  writeFigmaReport(root, runFigmaSync(root))
  writeSentryReport(root, runSentryScan(root))
  writeObsReport(root, runObsScan(root))
  writeGovReport(root, runGovScan(root))
  writeAuditReport(root, runAuditScan(root))
  writeReposReport(root, runReposScan(root))
  writePredictReport(root, runReleasePredict(root))
  writePlayReport(root, runPlayScan(root))
  writeDatasetReport(root, runDatasetScan(root))
  writeLoraReport(root, runLoraScan(root))
}

/** Default `--cron` regeneration interval in seconds. */
export const DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS = 300

/** Guard the interval option: NaN/<=0 from the CLI falls back to the default. */
export function cronIntervalSeconds(interval: unknown): number {
  return typeof interval === 'number' && Number.isFinite(interval) && interval > 0
    ? interval
    : DASHBOARD_CRON_DEFAULT_INTERVAL_SECONDS
}

/**
 * One `--cron` tick: regenerate the fast core reports, rebuild the aggregate
 * dashboard, and write all three artifacts (md / json / html). Returns the
 * fresh report plus the written paths.
 */
export async function dashboardCronTick(root: string): Promise<{ report: DashboardReport; paths: { mdPath: string; jsonPath: string; htmlPath: string } }> {
  await regenerateCoreReports(root)
  const report = await runDashboard(root, { run: false })
  const paths = writeDashboardReport(root, report)
  return { report, paths }
}

/** Run one dashboard generation. */
export async function runDashboard(root: string, options: DashboardOptions = {}): Promise<DashboardReport> {
  const generatedAt = Date.now()
  if (options.run) {
    await regenerateCoreReports(root)
  }
  const reports = collectAgentReports(root)
  const agents: DashboardAgent[] = reports.map(({ agent, report, file }) => {
    const rel = (p: string): string => relative(root, p).replace(/\\/g, '/')
    const reportJson = rel(file)
    const reportMd = rel(join(dirname(file), 'report.md'))
    return {
      agent,
      verdict: String(report.verdict ?? 'unknown'),
      ...severitiesOf(report),
      reportFile: reportJson,
      reportMd,
      findings: extractFindings(report).slice(0, 25),
    }
  })
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

/** Self-contained HTML dashboard with per-agent drill-down dialogs. */
export function renderDashboardHtml(report: DashboardReport): string {
  const cards = report.agents.map(a => {
    const cls = a.verdict === 'approved' ? 'ok' : a.verdict === 'needs-attention' ? 'warn' : 'bad'
    return `<button type="button" class="card ${cls}" data-agent="${escapeHtml(a.agent)}" title="Click for ${escapeHtml(a.agent)} details">` +
      `<h3>${escapeHtml(a.agent)}</h3><div class="verdict">${escapeHtml(a.verdict)}</div>` +
      `<div class="counts"><span class="err">${a.errors} err</span> <span class="warn">${a.warnings} warn</span> <span class="info">${a.infos} info</span></div>` +
      `<div class="drill">${a.findings?.length ?? 0} findings — click for details</div>` +
      `</button>`
  }).join('\n')
  const pct = report.summary.agents > 0 ? Math.round((report.agents.filter(a => a.verdict === 'approved').length / report.summary.agents) * 100) : 0

  // Embed the findings as JSON so the dialog needs no fetch and no CDN.
  const data = report.agents.map(a => ({
    agent: a.agent,
    verdict: a.verdict,
    errors: a.errors, warnings: a.warnings, infos: a.infos, total: a.total,
    reportFile: a.reportFile,
    reportMd: a.reportMd,
    findings: (a.findings ?? []).map(f => ({ severity: f.severity, id: f.id, message: f.message, suggestion: f.suggestion })),
  }))
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c')

  const dialog = `<dialog id="agent-detail">
    <div class="dialog-head"><h3 id="detail-title"></h3><div class="verdict" id="detail-verdict"></div><button type="button" class="close" id="detail-close" aria-label="Close">×</button></div>
    <div class="counts" id="detail-counts"></div>
    <div class="detail-links" id="detail-links"></div>
    <div class="findings" id="detail-findings"></div>
  </dialog>`

  const script = `<script>
  (function () {
    var DATA = ${dataJson};
    var byName = {};
    DATA.forEach(function (d) { byName[d.agent] = d; });
    var dialog = document.getElementById('agent-detail');
    var title = document.getElementById('detail-title');
    var verdict = document.getElementById('detail-verdict');
    var counts = document.getElementById('detail-counts');
    var links = document.getElementById('detail-links');
    var findings = document.getElementById('detail-findings');
    var close = document.getElementById('detail-close');
    function esc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function open(name) {
      var d = byName[name];
      if (!d) return;
      title.textContent = d.agent;
      verdict.textContent = d.verdict;
      counts.textContent = d.errors + ' errors · ' + d.warnings + ' warnings · ' + d.infos + ' info · ' + d.total + ' total';
      links.innerHTML = '';
      if (d.reportMd) {
        var m = document.createElement('a');
        m.href = '../' + encodeURIComponent(d.agent) + '/report.md';
        m.textContent = 'Full report (markdown)';
        links.appendChild(m);
      }
      if (d.reportFile) {
        var j = document.createElement('a');
        j.href = '../' + encodeURIComponent(d.agent) + '/report.json';
        j.textContent = 'Raw data (JSON)';
        links.appendChild(j);
      }
      findings.innerHTML = '';
      var list = d.findings || [];
      if (list.length === 0) {
        findings.innerHTML = '<div class="empty">No findings recorded for this agent.</div>';
      } else {
        list.forEach(function (f) {
          var item = document.createElement('div');
          item.className = 'finding ' + (f.severity === 'error' || f.severity === 'critical' ? 'err' : f.severity === 'warning' || f.severity === 'warn' ? 'warn' : 'info');
          var head = '<span class="sev">' + esc(f.severity) + '</span>';
          if (f.id) head += '<span class="id">' + esc(f.id) + '</span>';
          item.innerHTML = head + '<div class="msg">' + esc(f.message) + '</div>' + (f.suggestion ? '<div class="sug">' + esc(f.suggestion) + '</div>' : '');
          findings.appendChild(item);
        });
        if (list.length < d.total) {
          var more = document.createElement('div');
          more.className = 'empty';
          more.textContent = '… and ' + (d.total - list.length) + ' more in the full report.';
          findings.appendChild(more);
        }
      }
      dialog.showModal();
    }
    var cards = document.querySelectorAll('.card');
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function () { open(card.getAttribute('data-agent')); });
    });
    close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  })();
  </script>`

  return `<!doctype html><html><head><meta charset="utf-8"><title>Engineering Dashboard</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0f1115;color:#e6e8eb;padding:32px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;color:#9aa4b2;font-weight:500;margin:0 0 24px}
.overall{display:flex;gap:24px;align-items:center;margin-bottom:28px}
.big{font-size:44px;font-weight:700}${report.overall === 'approved' ? '.big{color:#3fb950}' : report.overall === 'needs-attention' ? '.big{color:#d29922}' : '.big{color:#f85149}'}
.meta{color:#9aa4b2;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.card{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:14px;cursor:pointer;text-align:left;color:inherit;font:inherit;font-family:inherit}
.card:hover{border-color:#30363d}
.card.ok{border-left:3px solid #3fb950}.card.warn{border-left:3px solid #d29922}.card.bad{border-left:3px solid #f85149}
h3{margin:0 0 8px;font-size:14px}.verdict{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9aa4b2;margin-bottom:10px}
.counts{font-size:12px}.counts .err{color:#f85149}.counts .warn{color:#d29922}.counts .info{color:#58a6ff}
.drill{font-size:11px;color:#58a6ff;margin-top:8px}
.empty{color:#9aa4b2;font-size:14px}
dialog{background:#161b22;border:1px solid #30363d;border-radius:12px;color:#e6e8eb;width:min(680px,92vw);max-height:80vh;overflow:auto;padding:20px}
dialog::backdrop{background:rgba(0,0,0,.6)}
.dialog-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.dialog-head h3{margin:0;font-size:18px;flex:1}
.dialog-head .close{background:#21262d;border:1px solid #30363d;color:#e6e8eb;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;line-height:1}
.detail-links{display:flex;gap:16px;margin:10px 0}
.detail-links a{color:#58a6ff;font-size:13px}
.finding{border:1px solid #21262d;border-radius:8px;padding:10px;margin-bottom:8px;background:#0f1115}
.finding.err{border-left:3px solid #f85149}.finding.warn{border-left:3px solid #d29922}.finding.info{border-left:3px solid #58a6ff}
.finding .sev{font-size:11px;text-transform:uppercase;font-weight:700;margin-right:8px}
.finding.err .sev{color:#f85149}.finding.warn .sev{color:#d29922}.finding.info .sev{color:#58a6ff}
.finding .id{font-size:11px;color:#6e7681;font-family:monospace}
.finding .msg{margin-top:4px;font-size:13px;line-height:1.5}
.finding .sug{margin-top:4px;font-size:12px;color:#9aa4b2}
</style></head><body><h1>Engineering Dashboard</h1><h2>Vectalon agent reports — ${escapeHtml(report.root)}</h2>
<div class="overall"><div class="big">${pct}%</div><div class="meta">${report.summary.agents} agents · ${report.summary.findings} findings<br>${report.summary.errors} errors · ${report.summary.warnings} warnings · ${report.summary.infos} infos<br>Overall: <b>${report.overall}</b></div></div>
<div class="grid">${cards || '<div class="empty">No agent reports found — run `vectalon dashboard --run` to generate the core set.</div>'}</div>
${dialog}
${script}
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
