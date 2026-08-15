/**
 * PortalPage — self-contained HTML install page for a build (Phase 3).
 *
 * Served by LocalServer at the root of a share session: QR placeholder,
 * platform badge, install instructions, metadata, and a direct download
 * link. QR requires the optional `qrcode` package; without it the URL is
 * printed prominently instead (deterministic degradation).
 */

import type { BuildManifest } from '../archive/types'

export interface InstallPageOptions {
  build: BuildManifest
  /** Public URL the page is served from (for the download link + QR). */
  baseUrl: string
  qrSvg?: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function renderInstallPage(opts: InstallPageOptions): string {
  const b = opts.build
  const downloadUrl = `${opts.baseUrl}/downloads/${b.buildId}.${b.artifactType}`
  const instructions =
    b.platform === 'ios'
      ? 'Open this page in Safari on your iPhone/iPad, tap Download, then trust the developer profile in Settings → General → VPN &amp; Device Management.'
      : 'Open this page on your Android device and tap Download, then allow installs from this source in Settings → Security.'
  const qr = opts.qrSvg
    ? `<img src="${opts.qrSvg}" alt="QR code" width="180" height="180" style="background:#fff;padding:8px;border-radius:8px" />`
    : `<div style="width:180px;height:180px;border:2px dashed #3A3A46;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#8A8A96;font-size:12px;text-align:center;padding:12px">QR unavailable<br/>— install the qrcode package</div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Install ${esc(b.flavor)} — v${esc(b.version)} (${b.buildNumber})</title>
<style>
body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#0B0B0F; color:#E8E0C8; display:flex; align-items:center; justify-content:center; min-height:100vh; }
.card { max-width:480px; width:100%; margin:24px; background:#14141B; border:1px solid #26262E; border-radius:14px; padding:28px; text-align:center; }
h1 { font-size:20px; margin:0 0 4px; }
.meta { color:#8A8A96; font-size:13px; margin:2px 0; font-family:ui-monospace,Menlo,monospace; }
.badge { display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px; font-weight:600; border:1px solid #007AFF; color:#007AFF; margin:6px 4px 0; }
.qr { margin:20px 0; }
.download { display:inline-block; margin-top:8px; padding:12px 22px; background:#007AFF; color:#fff; border-radius:10px; font-weight:600; text-decoration:none; font-size:15px; }
.instructions { text-align:left; color:#B8B0A0; font-size:13px; line-height:1.6; margin-top:18px; background:#0B0B0F; border:1px solid #26262E; border-radius:8px; padding:12px 14px; }
.url { font-family:ui-monospace,Menlo,monospace; font-size:12px; color:#8A8A96; word-break:break-all; margin-top:14px; }
</style>
</head>
<body>
<div class="card">
  <h1>${esc(b.flavor)} / ${esc(b.environment)}</h1>
  <p class="meta">v${esc(b.version)} (${b.buildNumber}) · ${formatBytes(b.artifactSize)}</p>
  <p><span class="badge">${b.platform}</span><span class="badge">${b.artifactType}</span></p>
  <div class="qr">${qr}</div>
  <a class="download" href="${downloadUrl}">Download .${b.artifactType}</a>
  <div class="instructions">${instructions}</div>
  <div class="url">${esc(opts.baseUrl)}</div>
  <p class="meta" style="margin-top:12px">sha256 ${b.checksum}</p>
</div>
</body>
</html>`
}
