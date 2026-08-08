/**
 * Self-contained dashboard HTML (no external assets). Counts and recent rows
 * are inlined server-side; a small script refreshes every 30s and renders
 * relative timestamps.
 */
import { activeHeartbeats, type ErrorReport, type HeartbeatPayload, type Store, type SupportRecord } from './types'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ts(ms?: number): string {
  return ms ? new Date(ms).toISOString() : '—'
}

export async function renderDashboard(store: Store): Promise<string> {
  const [counts, errors, beats, support] = await Promise.all([
    store.counts(),
    store.listErrors(20),
    store.listHeartbeats(100),
    store.listSupport(20),
  ])
  const active = activeHeartbeats(beats, Date.now())

  const errorRows = errors
    .map(
      e =>
        `<tr><td class="m">${esc((e.message || '').slice(0, 120))}</td><td>${esc(e.command || '—')}</td><td>${esc(e.version || '—')}</td><td>${esc(e.os || '—')}</td><td>${esc(ts(e.timestamp))}</td></tr>`
    )
    .join('')

  const beatRows = beats
    .map(
      b =>
        `<tr><td>${esc(b.kind)}</td><td>${esc(b.pid ?? '—')}</td><td>${esc(b.activeModelProvider || '—')}</td><td>${esc(b.projectType || '—')}</td><td>${esc(b.version || '—')}</td><td>${esc(ts(b.timestamp))}</td></tr>`
    )
    .join('')

  const supportRows = support
    .map(
      s =>
        `<tr><td><code>${esc(s.bundle.token)}</code></td><td>${s.emailed ? '📧 sent' : `⚠ pending`}${s.emailError ? ` <span class="dim" title="${esc(s.emailError)}">(${esc((s.emailError || '').slice(0, 40))})</span>` : ''}</td><td>${esc(s.bundle.version || '—')}</td><td>${esc(s.bundle.os || '—')}</td><td>${esc((s.bundle.errorQueue || []).length)}</td><td>${esc(s.receivedAt)}</td></tr>`
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vectalon telemetry</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0b0e14; color: #d7dce6; }
  header { padding: 18px 24px; border-bottom: 1px solid #1c2333; display: flex; align-items: center; justify-content: space-between; }
  header h1 { margin: 0; font-size: 16px; letter-spacing: 0.02em; }
  header h1 span { color: #6ee7b7; }
  header .meta { color: #6b7280; font-size: 12px; }
  main { padding: 24px; max-width: 1180px; margin: 0 auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .card { background: #11161f; border: 1px solid #1c2333; border-radius: 10px; padding: 14px 16px; }
  .card .num { font-size: 26px; font-weight: 700; color: #fff; }
  .card .label { color: #6b7280; font-size: 12px; margin-top: 2px; }
  .card .num.ok { color: #6ee7b7; } .card .num.warn { color: #fbbf24; } .card .num.crit { color: #f87171; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #8b93a7; margin: 26px 0 10px; }
  table { width: 100%; border-collapse: collapse; background: #11161f; border: 1px solid #1c2333; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #182033; vertical-align: top; }
  th { color: #8b93a7; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  tr:last-child td { border-bottom: none; }
  td.m { max-width: 460px; overflow-wrap: anywhere; }
  code { background: #182033; padding: 1px 6px; border-radius: 4px; }
  .dim { color: #6b7280; }
  .empty { color: #6b7280; text-align: center; padding: 18px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; background: #182033; color: #8b93a7; }
</style>
</head>
<body>
<header>
  <h1>vectalon <span>telemetry</span></h1>
  <div class="meta"><span id="now">—</span> · auto-refresh 30s · <a style="color:#6ee7b7" href="/v1/health">/v1/health</a></div>
</header>
<main>
  <div class="cards">
    <div class="card"><div class="num">${counts.errors}</div><div class="label">errors captured (capped 500)</div></div>
    <div class="card"><div class="num ${active.length ? 'ok' : 'dim'}">${active.length}</div><div class="label">active clients (last 10 min)</div></div>
    <div class="card"><div class="num ${counts.heartbeats ? 'ok' : ''}">${counts.heartbeats}</div><div class="label">heartbeats stored (capped 200)</div></div>
    <div class="card"><div class="num">${counts.support}</div><div class="label">support bundles (capped 100)</div></div>
  </div>

  <h2>Latest errors</h2>
  <table>
    <thead><tr><th>message</th><th>command</th><th>version</th><th>os</th><th>timestamp</th></tr></thead>
    <tbody>${errorRows || '<tr><td colspan="5" class="empty">No errors yet</td></tr>'}</tbody>
  </table>

  <h2>Recent heartbeats</h2>
  <table>
    <thead><tr><th>kind</th><th>pid</th><th>model provider</th><th>project</th><th>version</th><th>timestamp</th></tr></thead>
    <tbody>${beatRows || '<tr><td colspan="6" class="empty">No heartbeats yet</td></tr>'}</tbody>
  </table>

  <h2>Support bundles</h2>
  <table>
    <thead><tr><th>token</th><th>delivery</th><th>version</th><th>os</th><th>queued errors</th><th>received</th></tr></thead>
    <tbody>${supportRows || '<tr><td colspan="6" class="empty">No support bundles yet</td></tr>'}</tbody>
  </table>
</main>
<script>
  const fmt = t => { try { return new Date(t).toLocaleString() } catch { return t } };
  document.getElementById('now').textContent = fmt(${Date.now()});
  setInterval(() => location.reload(), 30000);
</script>
</body>
</html>`
}
