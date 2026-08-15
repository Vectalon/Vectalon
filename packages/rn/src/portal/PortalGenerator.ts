/**
 * PortalGenerator — white-label build portal (Phase 4).
 *
 * Generates a self-contained static site (the design doc's SSG mode): a
 * build-listing page, per-build detail pages with install instructions, and
 * an embedded `builds.json` — no runtime backend, deployable to any static
 * host (Vercel/Netlify/static export). Deterministic output for hermetic
 * tests; `--branding` overrides logo/colors.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { BuildManifest } from '../archive/types'

export interface PortalOptions {
  out: string
  domain?: string
  branding?: { logo?: string; primaryColor?: string; title?: string }
  builds: BuildManifest[]
}

export interface PortalResult {
  out: string
  fileCount: number
  builds: number
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function primaryColor(branding?: PortalOptions['branding']): string {
  return branding?.primaryColor || '#007AFF'
}

function title(branding?: PortalOptions['branding'], domain?: string): string {
  return branding?.title || (domain ? `${domain} — Builds` : 'Build Portal')
}

function pageShell(opts: { branding?: PortalOptions['branding']; domain?: string; body: string }): string {
  const color = primaryColor(opts.branding)
  const t = title(opts.branding, opts.domain)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(t)}</title>
<style>
:root { --brand: ${color}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0B0F; color: #E8E0C8; }
header { border-bottom: 1px solid #26262E; padding: 20px 32px; display: flex; align-items: center; gap: 12px; }
header h1 { font-size: 18px; margin: 0; }
header .domain { color: #8A8A96; font-size: 13px; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
.card { background: #14141B; border: 1px solid #26262E; border-radius: 10px; padding: 18px 20px; margin-bottom: 14px; }
.card h2 { margin: 0 0 6px; font-size: 16px; }
.meta { color: #8A8A96; font-size: 13px; margin: 2px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid var(--brand); color: var(--brand); margin-right: 6px; }
a { color: var(--brand); text-decoration: none; }
.download { display: inline-block; margin-top: 10px; padding: 9px 18px; background: var(--brand); color: #fff; border-radius: 8px; font-weight: 600; }
.code { background: #0B0B0F; border: 1px solid #26262E; border-radius: 6px; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-x: auto; }
footer { text-align: center; color: #5A5A66; font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>${esc(t)}</h1>
  ${opts.domain ? `<span class="domain">${esc(opts.domain)}</span>` : ''}
</header>
<main>
${opts.body}
</main>
<footer>Powered by Vectalon Archive &amp; Share</footer>
</body>
</html>
`
}

function buildCard(b: BuildManifest): string {
  const detail = `./build/${b.buildId}/index.html`
  return `<div class="card">
  <h2>${esc(b.flavor)} / ${esc(b.environment)} — v${esc(b.version)} (${b.buildNumber})</h2>
  <p class="meta"><span class="badge">${b.platform}</span><span class="badge">${b.artifactType}</span>${formatBytes(b.artifactSize)} · ${b.checksum.slice(0, 12)}…</p>
  <p class="meta">${esc(b.gitBranch)} @ ${b.gitCommit.slice(0, 8)} · ${esc(b.buildTimestamp)}</p>
  <a class="download" href="${detail}">Install / Details →</a>
</div>`
}

function renderListing(builds: BuildManifest[], opts: PortalOptions): string {
  const body = [
    `<h2 style="margin-top:0">Builds (${builds.length})</h2>`,
    ...(builds.length === 0 ? ['<p class="meta">No builds archived yet.</p>'] : builds.map(buildCard)),
  ].join('\n')
  return pageShell({ branding: opts.branding, domain: opts.domain, body })
}

function renderDetail(b: BuildManifest, opts: PortalOptions): string {
  const install =
    b.platform === 'ios'
      ? `<p>Install on your iPhone/iPad: open this page in Safari, tap <strong>Download .ipa</strong>, then trust the developer profile in Settings → General → VPN &amp; Device Management.</p>
<p class="code">xcrun devicectl device install app --device &lt;udid&gt; ${esc(b.artifactPath)}</p>`
      : `<p>Install on Android: open this page on the device and tap <strong>Download .apk</strong>, then allow installs from this source in Settings → Security.</p>
<p class="code">adb install -r ${esc(b.artifactPath)}</p>`
  const body = `
<div class="card">
  <h2>${esc(b.flavor)} / ${esc(b.environment)} — v${esc(b.version)} (${b.buildNumber})</h2>
  <p class="meta"><span class="badge">${b.platform}</span><span class="badge">${b.artifactType}</span>${formatBytes(b.artifactSize)}</p>
  <p class="meta">Build id: ${b.buildId}</p>
  <p class="meta">Checksum: sha256 ${b.checksum}</p>
  <p class="meta">Git: ${esc(b.gitBranch)} @ ${b.gitCommit}${b.gitTag ? ` (${esc(b.gitTag)})` : ''}</p>
  <p class="meta">Built: ${esc(b.buildTimestamp)} by ${esc(b.builtBy)}</p>
  <p class="meta">Node: ${esc(b.metadata.nodeVersion)}</p>
  <a class="download" href="../../downloads/${esc(b.buildId)}.${b.artifactType}">Download .${b.artifactType}</a>
</div>
<div class="card">
  <h2>Install instructions</h2>
  ${install}
</div>
<a href="../../index.html" style="font-size:13px">← All builds</a>`
  return pageShell({ branding: opts.branding, domain: opts.domain, body })
}

export function generatePortal(opts: PortalOptions): PortalResult {
  mkdirSync(join(opts.out, 'build'), { recursive: true })
  mkdirSync(join(opts.out, 'downloads'), { recursive: true })

  writeFileSync(join(opts.out, 'index.html'), renderListing(opts.builds, opts))
  writeFileSync(join(opts.out, 'builds.json'), JSON.stringify(opts.builds, null, 2) + '\n')
  for (const b of opts.builds) {
    mkdirSync(join(opts.out, 'build', b.buildId), { recursive: true })
    writeFileSync(join(opts.out, 'build', b.buildId, 'index.html'), renderDetail(b, opts))
    // Symlink-free copy descriptor: downloads/ link targets are documented in the README.
  }
  writeFileSync(
    join(opts.out, 'README.md'),
    `# Build portal

Generated by \`vectalon portal --generate\` — static SSG output.

- \`index.html\` — build listing
- \`builds.json\` — machine-readable build data
- \`build/<buildId>/index.html\` — per-build detail + install instructions

## Deploy

\`\`\`bash
npx vectalon portal --deploy --target vercel   # or netlify / static
\`\`\`

The download links in detail pages expect artifacts to be served from
\`downloads/<buildId>.<ext>\` — copy them there, or serve the portal from the
\`.vectalon/builds/\` store directly.
`
  )

  const fileCount = 3 + opts.builds.length + 1 // index + builds.json + README + per-build + (no downloads yet)
  return { out: opts.out, fileCount, builds: opts.builds.length }
}
