/**
 * Self-contained HTML dashboard for knowledge-refresh improvement suggestions
 * (`vectalon suggestions --open`). Single file, no network — the same pattern
 * as the bundle visualizer's report. Severity-grouped cards with current →
 * latest versions and the exact install command.
 * Business Source License 1.1 (BSL-1.1)
 */

import type { ImprovementSuggestion } from '../knowledge/refresh/types'
import { escapeHtml } from './html'

export interface SuggestionsReportData {
  generatedAt: string
  toolVersion: string
  suggestions: ImprovementSuggestion[]
  lastRefreshAt?: number
}

export function installCommandFor(suggestion: ImprovementSuggestion): string {
  return `npm install ${suggestion.library}@^${suggestion.latestVersion}`
}

const SEVERITY_ICON: Record<ImprovementSuggestion['severity'], string> = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

/** The full self-contained dashboard. No external assets; works offline. */
export function renderSuggestionsHtmlReport(data: SuggestionsReportData): string {
  const total = data.suggestions.length
  const bySeverity = {
    error: data.suggestions.filter(s => s.severity === 'error').length,
    warning: data.suggestions.filter(s => s.severity === 'warning').length,
    info: data.suggestions.filter(s => s.severity === 'info').length,
  }

  const cards = data.suggestions
    .map(s => {
      const cls = s.severity === 'error' ? 'fail' : s.severity === 'warning' ? 'warn' : 'info'
      const command = installCommandFor(s)
      const date = new Date(s.createdAt).toISOString().slice(0, 10)
      return `
<details class="card ${cls}" open>
  <summary>
    <span class="badge ${cls}">${SEVERITY_ICON[s.severity]} ${s.severity.toUpperCase()}</span>
    <span class="card-lib">${escapeHtml(s.library)}</span>
    <span class="card-title">${escapeHtml(s.title)}</span>
  </summary>
  <div class="card-body">
    <p class="desc">${escapeHtml(s.description)}</p>
    <div class="versions">
      <span class="v-current">current ${escapeHtml(s.currentVersion || '—')}</span>
      <span class="arrow">→</span>
      <span class="v-latest ${cls}">latest ${escapeHtml(s.latestVersion || '—')}</span>
    </div>
    <div class="command"><code>${escapeHtml(command)}</code></div>
    <div class="meta">suggestion id <code>${escapeHtml(s.id)}</code> · created ${date} · <a href="https://www.npmjs.com/package/${escapeHtml(s.library)}" target="_blank" rel="noopener">npm ↗</a></div>
  </div>
</details>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vectalon suggestions</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #e6edf3; }
  header { padding: 24px 28px 16px; border-bottom: 1px solid #21262d; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #8b949e; font-size: 13px; }
  .stats { display: flex; gap: 14px; margin-top: 14px; flex-wrap: wrap; }
  .stat { padding: 10px 16px; border-radius: 8px; background: #161b22; border: 1px solid #21262d; min-width: 120px; }
  .stat b { display: block; font-size: 20px; }
  .stat span { font-size: 12px; color: #8b949e; }
  .stat.error b { color: #f85149; } .stat.warning b { color: #d29922; } .stat.info b { color: #58a6ff; }
  .hint { margin-top: 14px; font-size: 13px; color: #8b949e; }
  .hint code { color: #58a6ff; }
  main { padding: 20px 28px 48px; }
  .card { border: 1px solid #21262d; border-radius: 10px; background: #161b22; margin-bottom: 10px; overflow: hidden; }
  .card.fail { border-left: 3px solid #f85149; } .card.warn { border-left: 3px solid #d29922; } .card.info { border-left: 3px solid #58a6ff; }
  .card summary { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; list-style: none; flex-wrap: wrap; }
  .card summary::-webkit-details-marker { display: none; }
  .card summary:hover { background: #1c2128; }
  .badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; letter-spacing: .05em; white-space: nowrap; }
  .badge.fail { background: #f8514933; color: #f85149; } .badge.warn { background: #d2992233; color: #d29922; } .badge.info { background: #58a6ff33; color: #58a6ff; }
  .card-lib { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #58a6ff; }
  .card-title { font-size: 14px; }
  .card-body { padding: 4px 16px 16px; border-top: 1px solid #21262d; }
  .desc { color: #8b949e; font-size: 13px; margin: 10px 0; }
  .versions { display: flex; align-items: baseline; gap: 10px; font-size: 14px; }
  .v-current { color: #8b949e; } .arrow { color: #8b949e; } .v-latest { font-weight: 700; }
  .v-latest.fail { color: #f85149; } .v-latest.warn { color: #d29922; } .v-latest.info { color: #58a6ff; }
  .command { margin-top: 10px; }
  .command code { display: inline-block; background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #3fb950; }
  .meta { margin-top: 8px; font-size: 11px; color: #8b949e; }
  .meta code { color: #8b949e; }
  .meta a { color: #58a6ff; text-decoration: none; }
  .empty { color: #8b949e; text-align: center; padding: 40px; }
  footer { padding: 20px 28px; color: #8b949e; font-size: 12px; border-top: 1px solid #21262d; }
</style>
</head>
<body>
<header>
  <h1>💡 vectalon suggestions</h1>
  <div class="sub">${escapeHtml(data.generatedAt)} · @vectalon-dev/rn ${escapeHtml(data.toolVersion)}${data.lastRefreshAt ? ` · refreshed ${new Date(data.lastRefreshAt).toISOString()}` : ''}</div>
  <div class="stats">
    <div class="stat"><b>${total}</b><span>suggestions</span></div>
    <div class="stat error"><b>${bySeverity.error}</b><span>errors</span></div>
    <div class="stat warning"><b>${bySeverity.warning}</b><span>warnings</span></div>
    <div class="stat info"><b>${bySeverity.info}</b><span>info</span></div>
  </div>
  <div class="hint">Apply one: <code>vectalon suggestions --apply &lt;id&gt; --yes</code> · refresh: <code>vectalon refresh --force</code></div>
</header>
<main>
  ${cards || '<div class="empty">No improvement suggestions on file. Run <code>vectalon refresh</code> to check your dependencies against the latest releases.</div>'}
</main>
<footer>Generated by <code>vectalon suggestions</code> · Business Source License 1.1</footer>
</body>
</html>`
}
