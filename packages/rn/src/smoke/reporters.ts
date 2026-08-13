/**
 * Smoke report renderers — terminal summary, JSON, activity log, HTML.
 * Business Source License 1.1 (BSL-1.1)
 */
import type { SmokeReport, SmokeRun, SmokeStatus } from './types'

const STATUS_LABEL: Record<SmokeStatus, string> = {
  pass: 'PASS',
  warn: 'WARN',
  skip: 'SKIP',
  fail: 'FAIL',
  timeout: 'TIME',
}

const STATUS_COLOR: Record<SmokeStatus, (s: string) => string> = {
  pass: s => `\u001b[32m${s}\u001b[0m`,
  warn: s => `\u001b[33m${s}\u001b[0m`,
  skip: s => `\u001b[36m${s}\u001b[0m`,
  fail: s => `\u001b[31m${s}\u001b[0m`,
  timeout: s => `\u001b[31m${s}\u001b[0m`,
}

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

/** Compact per-check terminal summary (status, name, duration, reason). */
export function renderTerminalSummary(report: SmokeReport): string {
  const lines: string[] = []
  lines.push(`vectalon smoke — @vectalon-dev/rn ${report.version} · flavor: ${report.flavor} · ${report.totals.total} checks`)
  lines.push('')
  for (const run of report.runs) {
    const status = STATUS_COLOR[run.status](STATUS_LABEL[run.status].padEnd(5))
    const name = run.check.name.padEnd(42)
    const time = fmtDuration(run.durationMs).padStart(8)
    const reason = run.reason ? ` — ${run.reason}` : ''
    lines.push(`  ${status}  ${name} ${time}${reason}`)
  }
  lines.push('')
  const t = report.totals
  lines.push(
    `Summary: ${t.pass} passed · ${t.warn} warned · ${t.skip} skipped · ${t.fail + t.timeout} failed — ${t.total} total (${fmtDuration(report.durationMs)})`
  )
  return lines.join('\n')
}

/** Full JSON report — every run with its complete output (CI consumption). */
export function renderJsonReport(report: SmokeReport): string {
  return JSON.stringify(report, null, 2)
}

/** Activity log — one line per check with the captured output beneath. */
export function renderActivityLog(report: SmokeReport): string {
  const lines: string[] = []
  lines.push(`vectalon smoke — @vectalon-dev/rn ${report.version} · ${report.generatedAt}`)
  lines.push(`flavor: ${report.flavor} · ${report.totals.total} checks · ${fmtDuration(report.durationMs)}`)
  lines.push('')
  for (const run of report.runs) {
    lines.push(`### ${run.check.id} — ${run.check.name}`)
    lines.push(`status: ${run.status}${run.reason ? ` (${run.reason})` : ''} · exit: ${run.exitCode ?? 'n/a'} · ${fmtDuration(run.durationMs)}`)
    lines.push(`command: vectalon ${run.args.join(' ')}`)
    lines.push('--- output ---')
    lines.push(run.output.trim() || '(no output)')
    lines.push('')
  }
  return lines.join('\n')
}

/** Self-contained HTML dashboard — grouped by category, output expandable. */
export function renderHtmlReport(report: SmokeReport): string {
  const statusDot: Record<SmokeStatus, string> = {
    pass: '#22c55e',
    warn: '#f59e0b',
    skip: '#06b6d4',
    fail: '#ef4444',
    timeout: '#ef4444',
  }
  const byCategory = new Map<string, SmokeRun[]>()
  for (const run of report.runs) {
    const list = byCategory.get(run.check.category) || []
    list.push(run)
    byCategory.set(run.check.category, list)
  }

  const categoryHtml = [...byCategory.entries()]
    .map(([category, runs]) => {
      const rows = runs
        .map(run => {
          const color = statusDot[run.status]
          const reason = run.reason ? `<span class="reason">${escapeHtml(run.reason)}</span>` : ''
          return `
          <details class="run ${run.status}">
            <summary>
              <span class="dot" style="background:${color}"></span>
              <span class="name">${escapeHtml(run.check.name)}</span>
              <span class="status">${run.status}</span>
              <span class="meta">${escapeHtml(run.args.join(' '))} · ${fmtDuration(run.durationMs)}${run.exitCode !== null ? ` · exit ${run.exitCode}` : ''}</span>
              ${reason}
            </summary>
            <pre>${escapeHtml(run.output.trim() || '(no output)')}</pre>
          </details>`
        })
        .join('\n')
      return `<section><h2>${escapeHtml(category)}</h2>${rows}</section>`
    })
    .join('\n')

  const t = report.totals
  const summary = [
    `${t.pass} passed`,
    `${t.warn} warned`,
    `${t.skip} skipped`,
    `${t.fail + t.timeout} failed`,
  ]
    .map((s, i) => `<span class="sum ${['pass', 'warn', 'skip', 'fail'][i]}">${s}</span>`)
    .join(' ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vectalon smoke — ${report.version}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b1220; color: #e2e8f0; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #94a3b8; font-size: 13px; margin-bottom: 16px; }
  .sum { margin-right: 12px; font-size: 13px; font-weight: 600; }
  .sum.pass { color: #22c55e; } .sum.warn { color: #f59e0b; } .sum.skip { color: #06b6d4; } .sum.fail { color: #ef4444; }
  section { margin-top: 20px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
  details.run { border: 1px solid #1e293b; border-radius: 8px; margin-bottom: 8px; background: #0f172a; }
  details.run summary { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; font-size: 14px; flex-wrap: wrap; }
  details.run.fail summary { border-left: 3px solid #ef4444; }
  details.run.timeout summary { border-left: 3px solid #ef4444; }
  details.run.warn summary { border-left: 3px solid #f59e0b; }
  details.run.skip summary { border-left: 3px solid #06b6d4; }
  details.run.pass summary { border-left: 3px solid #22c55e; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .name { font-weight: 600; }
  .status { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
  .meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #64748b; }
  .reason { font-size: 12px; color: #f59e0b; }
  pre { margin: 0; padding: 14px; overflow: auto; max-height: 480px; font-size: 12px; line-height: 1.5; background: #0b1220; border-top: 1px solid #1e293b; color: #cbd5e1; }
</style>
</head>
<body>
  <h1>vectalon smoke — @vectalon-dev/rn ${report.version}</h1>
  <div class="sub">flavor: ${report.flavor} · generated ${report.generatedAt} · ${report.totals.total} checks · ${fmtDuration(report.durationMs)}</div>
  <div>${summary}</div>
  ${categoryHtml}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
