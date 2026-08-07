/**
 * Vectalon RN — Self-test reporters
 * Business Source License 1.1 (BSL-1.1)
 *
 * Three views of a SelfTestReport:
 *  - terminal: a cli-table summary grouped by category, printed to stdout;
 *  - html: a self-contained dashboard (single file, no network) with
 *    per-check cards and expandable activity traces — the "visible interface";
 *  - json: the raw report for CI ingestion.
 */

import Table from 'cli-table'
import pc from 'picocolors'
import type { CheckRun, SelfTestReport } from './types'

const CATEGORY_LABELS: Record<string, string> = {
  cli: 'CLI',
  sdlc: 'SDLC',
  guardrails: 'Guardrails',
  knowledge: 'Knowledge',
  harness: 'Harness',
  model: 'Model',
  mcp: 'MCP',
  workflows: 'Workflows',
  ecosystem: 'Ecosystem',
  bench: 'Bench',
  adapters: 'Adapters',
  memory: 'Memory',
}

export function statusColor(status: string, label: string): string {
  if (status === 'pass') return pc.green(label)
  if (status === 'fail') return pc.red(label)
  return pc.yellow(label)
}

/** Terminal summary — one line per check, grouped by category. */
export function renderTerminalReport(report: SelfTestReport): string {
  const lines: string[] = []
  const grouped = new Map<string, CheckRun[]>()
  for (const run of report.runs) {
    const list = grouped.get(run.check.category) || []
    list.push(run)
    grouped.set(run.check.category, list)
  }

  for (const [category, runs] of grouped) {
    const label = CATEGORY_LABELS[category] || category
    lines.push('')
    lines.push(pc.bold(pc.cyan(`${label} (${runs.length})`)))
    const table = new Table({
      head: ['Status', 'Check', 'Detail'],
      style: { head: ['cyan'] },
      colWidths: [10, 34, 96],
    })
    for (const run of runs) {
      const status = statusColor(run.status, run.status.toUpperCase())
      const detail = run.error ? pc.red(run.detail || 'threw') : (run.detail || '')
      table.push([status, run.check.id, detail])
    }
    lines.push(table.toString())
  }

  lines.push('')
  lines.push(summaryLine(report))
  lines.push(activityLine(report))
  return lines.join('\n')
}

/** Compact final summary — used when the per-check lines already streamed live. */
export function renderTerminalSummary(report: SelfTestReport): string {
  const lines: string[] = []
  lines.push('')
  lines.push(summaryLine(report))
  lines.push(activityLine(report))
  return lines.join('\n')
}

function summaryLine(report: SelfTestReport): string {
  const t = report.totals
  return pc.bold(
    `Summary: ${pc.green(`${t.pass} passed`)} · ${pc.red(`${t.fail} failed`)} · ${pc.yellow(
      `${t.warn} warned`
    )} · ${t.total} total — ${(report.durationMs / 1000).toFixed(1)}s`
  )
}

function activityLine(report: SelfTestReport): string {
  return pc.dim(
    `Activity: ${report.activity.commands} command(s) run · ${report.activity.writes} file write(s) · ${report.activity.steps} step(s) recorded`
  )
}

/** Single human-readable activity log across all checks (the .log file). */
export function renderActivityLog(report: SelfTestReport): string {
  const lines: string[] = []
  lines.push(`# vectalon self-test — @vectalon-dev/rn ${report.version}`)
  lines.push(`Generated: ${report.generatedAt} · Duration: ${(report.durationMs / 1000).toFixed(1)}s`)
  const t = report.totals
  lines.push(`Result: ${t.pass} passed / ${t.fail} failed / ${t.warn} warned / ${t.total} total`)
  lines.push('')
  for (const run of report.runs) {
    lines.push(`## [${run.status.toUpperCase()}] ${run.check.id} — ${run.check.name} (${run.durationMs}ms)`)
    if (run.detail) lines.push(`detail: ${run.detail}`)
    if (run.error) lines.push(`error: ${run.error}`)
    if (run.steps.length > 0) {
      lines.push('activity:')
      lines.push(run.steps.map(s => formatStep(s)).join('\n'))
    }
    lines.push('')
  }
  return lines.join('\n')
}

function formatStep(s: { kind: string; message: string }): string {
  return `  ${s.message}`
}

/** Self-contained HTML dashboard — no external assets, works offline. */
export function renderHtmlReport(report: SelfTestReport): string {
  const t = report.totals
  const passPct = t.total > 0 ? Math.round((t.pass / t.total) * 100) : 0
  const cards = report.runs
    .map(run => {
      const steps = run.steps
        .map(step => {
          const cls = step.kind === 'warn' ? 'step-warn' : step.kind === 'command' ? 'step-cmd' : step.kind === 'write' ? 'step-write' : step.kind === 'artifact' ? 'step-art' : ''
          return `<div class="step ${cls}">${escapeHtml(step.message)}</div>`
        })
        .join('\n')
      return `
<details class="card ${run.status}" data-category="${run.check.category}" data-status="${run.status}">
  <summary>
    <span class="badge ${run.status}">${run.status.toUpperCase()}</span>
    <span class="card-id">${run.check.id}</span>
    <span class="card-name">${escapeHtml(run.check.name)}</span>
    <span class="card-time">${run.durationMs}ms</span>
  </summary>
  <div class="card-body">
    <p class="desc">${escapeHtml(run.check.description)}</p>
    ${run.detail ? `<p class="detail ${run.status}">${escapeHtml(run.detail)}</p>` : ''}
    ${run.error ? `<pre class="error">${escapeHtml(run.error)}</pre>` : ''}
    ${steps ? `<div class="steps"><div class="steps-title">Activity trace (${run.steps.length} step(s))</div>${steps}</div>` : ''}
  </div>
</details>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vectalon self-test — @vectalon-dev/rn ${escapeHtml(report.version)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #e6edf3; }
  header { padding: 24px 28px; border-bottom: 1px solid #21262d; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #8b949e; font-size: 13px; }
  .stats { display: flex; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
  .stat { padding: 10px 16px; border-radius: 8px; background: #161b22; border: 1px solid #21262d; min-width: 110px; }
  .stat b { display: block; font-size: 22px; }
  .stat.pass b { color: #3fb950; } .stat.fail b { color: #f85149; } .stat.warn b { color: #d29922; }
  .stat.total b { color: #58a6ff; }
  .stat span { font-size: 12px; color: #8b949e; }
  .bar { margin-top: 14px; height: 8px; border-radius: 4px; background: #21262d; overflow: hidden; }
  .bar > div { height: 100%; background: linear-gradient(90deg, #238636, #3fb950); }
  .filters { display: flex; gap: 8px; padding: 16px 28px; flex-wrap: wrap; border-bottom: 1px solid #21262d; position: sticky; top: 0; background: #0d1117; z-index: 5; }
  .filters button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 999px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
  .filters button:hover { background: #30363d; }
  .filters button.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  main { padding: 20px 28px 48px; }
  .card { border: 1px solid #21262d; border-radius: 10px; background: #161b22; margin-bottom: 10px; overflow: hidden; }
  .card.pass { border-left: 3px solid #3fb950; } .card.fail { border-left: 3px solid #f85149; } .card.warn { border-left: 3px solid #d29922; }
  .card summary { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; list-style: none; }
  .card summary::-webkit-details-marker { display: none; }
  .card summary:hover { background: #1c2128; }
  .badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; letter-spacing: .05em; }
  .badge.pass { background: #23863633; color: #3fb950; } .badge.fail { background: #f8514933; color: #f85149; } .badge.warn { background: #d2992233; color: #d29922; }
  .card-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #58a6ff; }
  .card-name { font-size: 14px; }
  .card-time { margin-left: auto; color: #8b949e; font-size: 12px; }
  .card-body { padding: 4px 16px 16px; border-top: 1px solid #21262d; }
  .desc { color: #8b949e; font-size: 13px; }
  .detail { font-size: 13px; }
  .detail.pass { color: #3fb950; } .detail.fail { color: #f85149; } .detail.warn { color: #d29922; }
  .error { background: #f8514911; border: 1px solid #f8514933; color: #ffa198; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; }
  .steps { margin-top: 10px; }
  .steps-title { font-size: 12px; color: #8b949e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .06em; }
  .step { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; padding: 5px 10px; border-radius: 6px; margin-bottom: 3px; background: #0d1117; color: #c9d1d9; }
  .step-warn { color: #d29922; }
  .step-cmd { color: #58a6ff; }
  .step-write { color: #3fb950; }
  .step-art { color: #bc8cff; }
  .empty { color: #8b949e; text-align: center; padding: 40px; }
  footer { padding: 20px 28px; color: #8b949e; font-size: 12px; border-top: 1px solid #21262d; }
</style>
</head>
<body>
<header>
  <h1>🧪 vectalon self-test — @vectalon-dev/rn ${escapeHtml(report.version)}</h1>
  <div class="sub">${escapeHtml(report.generatedAt)} · ${(report.durationMs / 1000).toFixed(1)}s · ${report.activity.commands} command(s) · ${report.activity.writes} file write(s)</div>
  <div class="stats">
    <div class="stat pass"><b>${t.pass}</b><span>passed</span></div>
    <div class="stat fail"><b>${t.fail}</b><span>failed</span></div>
    <div class="stat warn"><b>${t.warn}</b><span>warned</span></div>
    <div class="stat total"><b>${t.total}</b><span>checks</span></div>
  </div>
  <div class="bar"><div style="width: ${passPct}%"></div></div>
</header>
<div class="filters">
  <button data-filter="all" class="active">All</button>
  <button data-filter="pass">Pass</button>
  <button data-filter="fail">Fail</button>
  <button data-filter="warn">Warn</button>
  <span style="width:12px"></span>
  ${Object.keys(CATEGORY_LABELS)
    .map(c => `<button data-cat="${c}">${CATEGORY_LABELS[c]}</button>`)
    .join('')}
</div>
<main id="cards">${cards}</main>
<footer>Generated by <code>vectalon selftest</code> · Business Source License 1.1</footer>
<script>
  const statusBtn = document.querySelectorAll('button[data-filter]');
  const catBtns = document.querySelectorAll('button[data-cat]');
  let status = 'all', cat = 'all';
  function apply() {
    let visible = 0;
    document.querySelectorAll('.card').forEach(card => {
      const okStatus = status === 'all' || card.dataset.status === status;
      const okCat = cat === 'all' || card.dataset.category === cat;
      const show = okStatus && okCat;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    document.getElementById('empty').style.display = visible ? 'none' : 'block';
  }
  statusBtn.forEach(b => b.addEventListener('click', () => {
    statusBtn.forEach(x => x.classList.remove('active'));
    b.classList.add('active'); status = b.dataset.filter; apply();
  }));
  catBtns.forEach(b => b.addEventListener('click', () => {
    catBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active'); cat = b.dataset.cat; apply();
  }));
  const empty = document.createElement('div');
  empty.id = 'empty'; empty.className = 'empty';
  empty.textContent = 'No checks match the current filter.';
  document.getElementById('cards').appendChild(empty);
  apply();
</script>
</body>
</html>`
}

export function renderJsonReport(report: SelfTestReport): string {
  return JSON.stringify(report, null, 2)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
