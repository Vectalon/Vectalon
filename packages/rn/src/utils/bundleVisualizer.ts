/**
 * Bundle visualizer — the "Option C" view of `vectalon bundle`:
 *
 *  - Terminal: a tight verdict plus ASCII bars for the top packages (swap
 *    candidates flagged inline);
 *  - Browser: a self-contained HTML dashboard (single file, no network) with
 *    a squarified treemap of the whole bundle, per-package drill-down,
 *    highlighted budget violations, and replacement-suggestion cards fed by
 *    npm maintenance signals.
 *
 * The treemap rectangles are computed here in TypeScript (pure + testable) and
 * embedded as data; the page only positions them. Business Source License 1.1
 * (BSL-1.1)
 */

import pc from 'picocolors'
import type { BundleAnalysis, BudgetFinding } from './bundleAnalyzer'
import { formatBytes, packageFromModulePath } from './bundleAnalyzer'
import { alternativeFor, isSwapCandidate, type KnownAlternative, type PackageSignals } from './npmSignals'
import { escapeHtml } from './html'

export interface TreemapItem {
  name: string
  value: number
}

export interface TreemapRect extends TreemapItem {
  x: number
  y: number
  width: number
  height: number
}

export interface AsciiBarOptions {
  /** How many packages to render (default 5). */
  top?: number
  /** Max bar length in characters (default 24). */
  barWidth?: number
}

/** Worst aspect ratio inside a row, per the squarify paper (Bruls et al.). */
function worstAspect(row: number[], rowArea: number, shortSide: number): number {
  if (row.length === 0 || rowArea <= 0 || shortSide <= 0) return Infinity
  const s2 = shortSide * shortSide
  const a2 = rowArea * rowArea
  let worst = 0
  for (const v of row) {
    const ratio = Math.max((s2 * v) / a2, a2 / (s2 * v))
    if (ratio > worst) worst = ratio
  }
  return worst
}

/**
 * Squarified treemap layout. Pure and deterministic: returns the rectangle
 * for every input item, tiling `width × height` with area proportional to
 * `value`. Items with non-positive values are skipped.
 */
export function computeTreemap(items: TreemapItem[], width: number, height: number): TreemapRect[] {
  const rects: TreemapRect[] = []
  if (width <= 0 || height <= 0) return rects
  const usable = items.filter(i => i.value > 0)
  const total = usable.reduce((s, i) => s + i.value, 0)
  if (total <= 0) return rects
  const scaled = usable
    .map(i => ({ name: i.name, value: (i.value / total) * width * height }))
    .sort((a, b) => b.value - a.value)

  let x = 0
  let y = 0
  let w = width
  let h = height
  let idx = 0
  while (idx < scaled.length) {
    if (w <= 0 || h <= 0) break
    const horizontal = w >= h
    const shortSide = horizontal ? h : w

    // Greedily grow the row while adding the next item does not worsen the
    // worst aspect ratio.
    const row: TreemapItem[] = [scaled[idx]]
    let rowArea = scaled[idx].value
    idx++
    const rowWorst = (r: TreemapItem[], area: number) => worstAspect(r.map(i => i.value), area, shortSide)
    while (idx < scaled.length) {
      const nextArea = rowArea + scaled[idx].value
      if (rowWorst([...row, scaled[idx]], nextArea) <= rowWorst(row, rowArea)) {
        row.push(scaled[idx])
        rowArea = nextArea
        idx++
      } else break
    }

    if (horizontal) {
      // Row spans the full width; thickness along the short (vertical) side.
      const thickness = rowArea / w
      let cx = x
      for (const item of row) {
        const rectW = item.value / thickness
        rects.push({ name: item.name, value: item.value, x: cx, y, width: rectW, height: thickness })
        cx += rectW
      }
      y += thickness
      h -= thickness
    } else {
      // Row spans the full height; thickness along the short (horizontal) side.
      const thickness = rowArea / h
      let cy = y
      for (const item of row) {
        const rectH = item.value / thickness
        rects.push({ name: item.name, value: item.value, x, y: cy, width: thickness, height: rectH })
        cy += rectH
      }
      x += thickness
      w -= thickness
    }
  }
  return rects
}

/** Deterministic per-package color (stable across runs). */
export function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue} 60% 42%)`
}

/**
 * Terminal ASCII bar chart — the top packages with sizes, share, and inline
 * swap-candidate hints. Pure string builder; the command logs the result.
 */
export function renderAsciiBarChart(analysis: BundleAnalysis, opts: AsciiBarOptions = {}): string {
  const top = opts.top ?? 5
  const barWidth = opts.barWidth ?? 24
  const packages = analysis.packages.slice(0, top)
  if (packages.length === 0 || analysis.totalSize <= 0) return ''
  const maxSize = packages[0].size

  const lines: string[] = [pc.bold('Top packages:')]
  for (const pkg of packages) {
    const share = (pkg.size / analysis.totalSize) * 100
    const filled = (pkg.size / maxSize) * barWidth
    const bar = '█'.repeat(Math.floor(filled)) + (filled - Math.floor(filled) >= 0.5 ? '▌' : '')
    const alt = isSwapCandidate(pkg.name)
      ? `  ${pc.yellow(`swap → ${alternativeFor(pkg.name)!.to}`)}`
      : ''
    lines.push(
      `${pkg.name.padEnd(34)} ${formatBytes(pkg.size).padStart(9)} ${bar.padEnd(barWidth)} ${share.toFixed(1).padStart(5)}%${alt}`
    )
  }
  return lines.join('\n')
}

export interface BundleSuggestionCard {
  name: string
  size: number
  moduleCount: number
  sharePct: number
  alternative?: KnownAlternative
  signals?: PackageSignals
  finding?: BudgetFinding
}

export interface TreemapCell extends TreemapRect {
  color: string
  /** Original byte size of the package (value holds the scaled pixel area). */
  size: number
  /** Package has a large-library budget finding. */
  finding: boolean
  /** Package has a known lighter alternative. */
  swap: boolean
}

export interface BundleReportData {
  generatedAt: string
  toolVersion: string
  platform: string
  totalSize: number
  moduleCount: number
  deltaPct: number | null
  deltaLabel: string
  budgetVerdict: 'met' | 'warn' | 'fail'
  packages: Array<{ name: string; size: number; moduleCount: number; sharePct: number }>
  treemap: TreemapCell[]
  findings: BudgetFinding[]
  largestModules: Array<{ name: string; size: number; package: string }>
  assets: Array<{ name: string; size: number }>
  suggestions: BundleSuggestionCard[]
  offline: boolean
}

const TREEMAP_WIDTH = 960
const TREEMAP_HEIGHT = 520

function findingForPackage(name: string, findings: BudgetFinding[]): BudgetFinding | undefined {
  return findings.find(f => (f.rule === 'large-library' || f.rule === 'large-asset') && f.message.includes(`"${name}"`))
}

/** Assemble everything the HTML dashboard needs from one analysis. */
export function buildBundleReportData(
  analysis: BundleAnalysis,
  opts: {
    platform: string
    deltaPct: number | null
    deltaLabel: string
    findings: BudgetFinding[]
    signals: Record<string, PackageSignals>
    toolVersion: string
  }
): BundleReportData {
  const packages = analysis.packages.map(p => ({
    name: p.name,
    size: p.size,
    moduleCount: p.moduleCount,
    sharePct: analysis.totalSize > 0 ? (p.size / analysis.totalSize) * 100 : 0,
  }))
  const sizeByPackage = new Map(analysis.packages.map(p => [p.name, p.size]))
  const treemap = computeTreemap(
    analysis.packages.map(p => ({ name: p.name, value: p.size })),
    TREEMAP_WIDTH,
    TREEMAP_HEIGHT
  ).map(rect => ({
    ...rect,
    size: sizeByPackage.get(rect.name) || 0,
    color: colorFor(rect.name),
    finding: !!findingForPackage(rect.name, opts.findings),
    swap: isSwapCandidate(rect.name),
  }))

  const hasSignals = Object.keys(opts.signals).length > 0
  const suggestions: BundleSuggestionCard[] = analysis.packages
    .slice(0, 12)
    .map((pkg): BundleSuggestionCard | null => {
      const signals = opts.signals[pkg.name]
      const alternative = alternativeFor(pkg.name)
      if (!signals && !alternative) return null
      return {
        name: pkg.name,
        size: pkg.size,
        moduleCount: pkg.moduleCount,
        sharePct: analysis.totalSize > 0 ? (pkg.size / analysis.totalSize) * 100 : 0,
        ...(alternative ? { alternative } : {}),
        ...(signals ? { signals } : {}),
        ...(findingForPackage(pkg.name, opts.findings) ? { finding: findingForPackage(pkg.name, opts.findings)! } : {}),
      }
    })
    .filter((s): s is BundleSuggestionCard => s !== null)

  const severity = opts.findings.filter(f => f.severity === 'error').length
  const warnings = opts.findings.filter(f => f.severity === 'warning').length
  const budgetVerdict = severity > 0 ? 'fail' : warnings > 0 ? 'warn' : 'met'

  return {
    generatedAt: new Date().toISOString(),
    toolVersion: opts.toolVersion,
    platform: opts.platform,
    totalSize: analysis.totalSize,
    moduleCount: analysis.moduleCount,
    deltaPct: opts.deltaPct,
    deltaLabel: opts.deltaLabel,
    budgetVerdict,
    packages,
    treemap,
    findings: opts.findings,
    largestModules: analysis.largestModules.map(m => ({
      name: m.name,
      size: m.size,
      package: packageFromModulePath(m.sourcePath, m.name),
    })),
    assets: analysis.assets,
    suggestions,
    offline: !hasSignals,
  }
}

function formatCount(n: number | undefined): string {
  if (n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

const VERDICT_LABEL: Record<BundleReportData['budgetVerdict'], string> = {
  met: 'All performance budgets met',
  warn: 'Budget warnings — see violations below',
  fail: 'Budget violations — review before shipping',
}

/** The full self-contained dashboard. No external assets; works offline. */
export function renderBundleHtmlReport(data: BundleReportData): string {
  const stats = data.totalSize > 0
  const biggest = data.packages[0]
  const severity = data.budgetVerdict === 'fail' ? 'fail' : data.budgetVerdict === 'warn' ? 'warn' : 'pass'
  const deltaClass = data.deltaPct === null ? '' : data.deltaPct > 1 ? 'neg' : data.deltaPct < -1 ? 'pos' : 'flat'

  const findingRows = data.findings
    .map(f => {
      const cls = f.severity === 'error' ? 'fail' : f.severity === 'warning' ? 'warn' : 'info'
      return `<div class="finding ${cls}"><span class="badge ${cls}">${f.severity.toUpperCase()}</span><code>${escapeHtml(f.rule)}</code><span class="finding-msg">${escapeHtml(f.message)}</span></div>`
    })
    .join('\n')

  const suggestionCards = data.suggestions
    .map(s => {
      const sig = s.signals
      const rows = [
        sig?.version ? `<div><span>latest</span><b>${escapeHtml(sig.version)}</b></div>` : '',
        sig?.lastPublish ? `<div><span>last publish</span><b>${escapeHtml(formatDate(sig.lastPublish))}</b></div>` : '',
        sig?.weeklyDownloads !== undefined ? `<div><span>weekly downloads</span><b>${formatCount(sig.weeklyDownloads)}</b></div>` : '',
        sig?.githubStars !== undefined ? `<div><span>github stars</span><b>${formatCount(sig.githubStars)}</b></div>` : '',
      ]
        .filter(Boolean)
        .join('')
      const altHtml = s.alternative
        ? `<div class="alt"><div class="alt-head">→ swap for <b>${escapeHtml(s.alternative.to)}</b></div><p>${escapeHtml(s.alternative.reason)}</p><div class="alt-save">${escapeHtml(s.alternative.savings)}</div></div>`
        : ''
      const signalsBlock = sig
        ? `<div class="sig-grid">${rows}</div>`
        : `<div class="no-sig">${data.offline ? 'offline — no npm signals fetched' : 'no registry data for this package'}</div>`
      return `
<div class="s-card" data-name="${escapeHtml(s.name)}">
  <div class="s-head">
    <div class="s-name">${escapeHtml(s.name)}</div>
    <div class="s-size">${formatBytes(s.size)} · ${s.sharePct.toFixed(1)}% of bundle</div>
  </div>
  <div class="s-meta">${s.moduleCount} module(s)${s.finding ? ' · <span class="warn-text">budget violation</span>' : ''}</div>
  ${signalsBlock}
  ${altHtml}
  <div class="s-links">${sig ? `<a href="${escapeHtml(sig.npmUrl)}" target="_blank" rel="noopener">npm ↗</a>` : ''}${sig?.githubUrl ? `<a href="${escapeHtml(sig.githubUrl)}" target="_blank" rel="noopener">github ↗</a>` : ''}</div>
</div>`
    })
    .join('\n')

  const assetRows = data.assets
    .map(a => `<div class="asset"><code>${escapeHtml(a.name)}</code><b>${formatBytes(a.size)}</b></div>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vectalon bundle — ${escapeHtml(data.platform)}</title>
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
  .stat.total b { color: #58a6ff; } .stat.delta b { color: #8b949e; } .stat.delta.neg b { color: #f85149; } .stat.delta.pos b { color: #3fb950; }
  .verdict { display: inline-block; margin-top: 14px; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .verdict.pass { background: #23863633; color: #3fb950; border: 1px solid #238636; }
  .verdict.warn { background: #d2992233; color: #d29922; border: 1px solid #9e6a03; }
  .verdict.fail { background: #f8514933; color: #f85149; border: 1px solid #da3633; }
  .controls { display: flex; gap: 10px; padding: 14px 28px; align-items: center; border-bottom: 1px solid #21262d; position: sticky; top: 0; background: #0d1117; z-index: 5; flex-wrap: wrap; }
  .controls input[type=search] { background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 8px; padding: 8px 12px; font-size: 13px; min-width: 220px; }
  .controls input[type=search]:focus { outline: none; border-color: #1f6feb; }
  label.check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #8b949e; cursor: pointer; }
  main { padding: 20px 28px 48px; }
  section h2 { font-size: 15px; margin: 28px 0 12px; color: #c9d1d9; }
  #treemap { position: relative; width: 100%; height: 520px; border-radius: 10px; overflow: hidden; border: 1px solid #21262d; background: #161b22; }
  .cell { position: absolute; overflow: hidden; cursor: pointer; transition: filter .12s ease, opacity .12s ease; }
  .cell:hover { filter: brightness(1.25); }
  .cell .label { position: absolute; left: 4px; bottom: 4px; font-size: 11px; color: rgba(255,255,255,.92); text-shadow: 0 1px 2px rgba(0,0,0,.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 96%; pointer-events: none; }
  .cell .badge { position: absolute; top: 3px; right: 3px; font-size: 9px; padding: 1px 5px; border-radius: 999px; background: rgba(0,0,0,.55); pointer-events: none; }
  .cell.selected { outline: 2px solid #58a6ff; z-index: 2; }
  .cell.dim { opacity: .18; }
  #tooltip { position: absolute; pointer-events: none; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 8px 10px; font-size: 12px; z-index: 10; display: none; box-shadow: 0 4px 16px rgba(0,0,0,.5); }
  #tooltip b { display: block; font-size: 13px; }
  #tooltip span { color: #8b949e; }
  #detail { margin-top: 14px; border: 1px solid #21262d; border-radius: 10px; background: #161b22; padding: 16px; display: none; }
  #detail .d-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  #detail h3 { margin: 0; font-size: 16px; }
  #detail .d-close { margin-left: auto; background: none; border: none; color: #8b949e; font-size: 16px; cursor: pointer; }
  .d-stats { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .d-stat { background: #0d1117; border: 1px solid #21262d; border-radius: 8px; padding: 8px 12px; font-size: 12px; }
  .d-stat b { display: block; font-size: 16px; color: #58a6ff; }
  .modules { margin-top: 12px; }
  .module { display: flex; justify-content: space-between; gap: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #21262d; }
  .module span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .module b { color: #8b949e; white-space: nowrap; }
  .finding { display: flex; align-items: baseline; gap: 10px; padding: 9px 12px; border-radius: 8px; background: #161b22; border: 1px solid #21262d; margin-bottom: 6px; font-size: 13px; }
  .finding.fail { border-left: 3px solid #f85149; } .finding.warn { border-left: 3px solid #d29922; } .finding.info { border-left: 3px solid #58a6ff; }
  .finding code { font-size: 11px; color: #8b949e; white-space: nowrap; }
  .finding-msg { color: #c9d1d9; }
  .badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; letter-spacing: .05em; white-space: nowrap; }
  .badge.fail { background: #f8514933; color: #f85149; } .badge.warn { background: #d2992233; color: #d29922; } .badge.info { background: #58a6ff33; color: #58a6ff; }
  .empty { color: #8b949e; text-align: center; padding: 32px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .s-card { border: 1px solid #21262d; border-radius: 10px; background: #161b22; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .s-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .s-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #58a6ff; overflow-wrap: anywhere; }
  .s-size { font-size: 12px; color: #8b949e; white-space: nowrap; }
  .s-meta { font-size: 12px; color: #8b949e; }
  .warn-text { color: #d29922; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .sig-grid div { font-size: 12px; color: #8b949e; }
  .sig-grid b { display: block; color: #e6edf3; font-size: 13px; }
  .no-sig { font-size: 12px; color: #8b949e; font-style: italic; }
  .alt { border: 1px dashed #238636; border-radius: 8px; padding: 10px; background: #23863611; }
  .alt-head { font-size: 13px; color: #3fb950; }
  .alt p { margin: 6px 0; font-size: 12px; color: #c9d1d9; }
  .alt-save { font-size: 11px; color: #3fb950; }
  .s-links { display: flex; gap: 12px; margin-top: auto; }
  .s-links a { color: #58a6ff; font-size: 12px; text-decoration: none; }
  .s-links a:hover { text-decoration: underline; }
  .assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px; }
  .asset { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 7px 10px; }
  .asset code { color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .asset b { color: #8b949e; white-space: nowrap; }
  footer { padding: 20px 28px; color: #8b949e; font-size: 12px; border-top: 1px solid #21262d; }
  .legend { display: flex; gap: 14px; font-size: 12px; color: #8b949e; margin-top: 8px; flex-wrap: wrap; }
  .legend .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; }
</style>
</head>
<body>
<header>
  <h1>📦 vectalon bundle — ${escapeHtml(data.platform)}</h1>
  <div class="sub">${escapeHtml(data.generatedAt)} · @vectalon-dev/rn ${escapeHtml(data.toolVersion)} · ${data.moduleCount} module(s)</div>
  <div class="stats">
    <div class="stat total"><b>${stats ? formatBytes(data.totalSize) : '—'}</b><span>total bundle</span></div>
    <div class="stat"><b>${data.moduleCount}</b><span>modules</span></div>
    <div class="stat delta ${deltaClass}"><b>${escapeHtml(data.deltaLabel)}</b><span>vs previous snapshot</span></div>
    ${biggest ? `<div class="stat"><b>${escapeHtml(biggest.name)}</b><span>largest · ${biggest.sharePct.toFixed(1)}%</span></div>` : ''}
  </div>
  <div class="verdict ${severity}">${VERDICT_LABEL[data.budgetVerdict]}</div>
</header>
<div class="controls">
  <input type="search" id="search" placeholder="Filter packages…" autocomplete="off" />
  <label class="check"><input type="checkbox" id="violations" /> budget violations only</label>
  <label class="check"><input type="checkbox" id="swaps" /> swap candidates only</label>
</div>
<main>
  <section>
    <h2>Bundle composition</h2>
    <div id="treemap"><div id="tooltip"></div></div>
    <div class="legend">
      <span><span class="sw" style="background:#f85149"></span>budget violation</span>
      <span><span class="sw" style="background:#3fb950"></span>swap candidate</span>
      <span>click a block for details</span>
    </div>
  </section>
  <section id="detail"></section>
  <section>
    <h2>Budget findings (${data.findings.length})</h2>
    ${findingRows || '<div class="empty">No budget findings — all budgets met.</div>'}
  </section>
  <section>
    <h2>Replacement suggestions</h2>
    <div class="cards">${suggestionCards || `<div class="empty">${data.offline ? 'No registry data fetched (offline?) — sizes below come from the bundle itself.' : 'No suggestions — the heaviest packages have no known lighter alternative.'}</div>`}</div>
  </section>
  ${data.assets.length ? `<section><h2>Assets</h2><div class="assets">${assetRows}</div></section>` : ''}
  <section>
    <h2>Largest modules</h2>
    <div id="modules"></div>
  </section>
</main>
<footer>Generated by <code>vectalon bundle</code> · Business Source License 1.1</footer>
<script>
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const fmt = b => {
  if (b <= 0) return '0 B';
  const u = ['B','KB','MB','GB']; let v = b, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
};
const pct = n => (n || 0).toFixed(1) + '%';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const treemap = document.getElementById('treemap');
const tooltip = document.getElementById('tooltip');
const BASE_W = ${TREEMAP_WIDTH}, BASE_H = ${TREEMAP_HEIGHT};
const cells = new Map();
let selected = null;

const cellEl = DATA.treemap.map(t => {
  const el = document.createElement('div');
  el.className = 'cell';
  el.style.left = (t.x / BASE_W * 100) + '%';
  el.style.top = (t.y / BASE_H * 100) + '%';
  el.style.width = (t.width / BASE_W * 100) + '%';
  el.style.height = (t.height / BASE_H * 100) + '%';
  el.style.background = t.color;
  el.dataset.name = t.name;
  if (t.width > 40 && t.height > 24) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = t.name;
    el.appendChild(label);
  }
  if (t.finding || t.swap) {
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.style.background = t.finding ? '#f85149' : '#238636';
    badge.style.color = '#fff';
    badge.textContent = t.finding ? 'violation' : 'swap';
    el.appendChild(badge);
  }
  el.addEventListener('mouseenter', e => {
    const r = treemap.getBoundingClientRect();
    tooltip.innerHTML = '<b>' + esc(t.name) + '</b><span>' + fmt(t.size) + ' · ' + pct(DATA.packages.find(p => p.name === t.name).sharePct) + '</span>';
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX - r.left + 12, r.width - 140) + 'px';
    tooltip.style.top = (e.clientY - r.top - 46) + 'px';
  });
  el.addEventListener('mousemove', e => {
    const r = treemap.getBoundingClientRect();
    tooltip.style.left = Math.min(e.clientX - r.left + 12, r.width - 140) + 'px';
    tooltip.style.top = (e.clientY - r.top - 46) + 'px';
  });
  el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  el.addEventListener('click', () => selectPackage(t.name));
  treemap.appendChild(el);
  cells.set(t.name, el);
  return el;
});

function renderModules(name) {
  const pkg = DATA.packages.find(p => p.name === name);
  const mods = DATA.largestModules.filter(m => m.package === name);
  const box = document.getElementById('modules');
  if (!mods.length) { box.innerHTML = '<div class="empty">No module detail for this package.</div>'; return; }
  box.innerHTML = mods.slice(0, 12).map(m =>
    '<div class="module"><span>' + esc(m.name) + '</span><b>' + fmt(m.size) + '</b></div>'
  ).join('');
}

function selectPackage(name) {
  const pkg = DATA.packages.find(p => p.name === name);
  if (!pkg) return;
  selected = name;
  cells.forEach((el, n) => el.classList.toggle('selected', n === name));
  const t = DATA.treemap.find(x => x.name === name);
  const finding = DATA.findings.find(f => f.message.includes('"' + name + '"'));
  const suggestion = DATA.suggestions.find(s => s.name === name);
  const detail = document.getElementById('detail');
  detail.style.display = 'block';
  detail.innerHTML =
    '<div class="d-head"><h3>' + esc(name) + '</h3>' +
    (t && t.swap ? '<span class="badge warn">swap candidate</span>' : '') +
    (t && t.finding ? '<span class="badge fail">budget violation</span>' : '') +
    '<button class="d-close" title="Close">✕</button></div>' +
    '<div class="d-stats">' +
    '<div class="d-stat"><b>' + fmt(pkg.size) + '</b><span>bundle size</span></div>' +
    '<div class="d-stat"><b>' + pkg.moduleCount + '</b><span>modules</span></div>' +
    '<div class="d-stat"><b>' + pct(pkg.sharePct) + '</b><span>of total</span></div>' +
    '</div>' +
    (finding ? '<div class="finding ' + finding.severity + '" style="margin-top:10px"><span class="badge ' + finding.severity + '">' + finding.severity.toUpperCase() + '</span><span class="finding-msg">' + esc(finding.message) + '</span></div>' : '') +
    (suggestion && suggestion.alternative ? '<div class="alt" style="margin-top:10px"><div class="alt-head">→ swap for <b>' + esc(suggestion.alternative.to) + '</b></div><p>' + esc(suggestion.alternative.reason) + '</p><div class="alt-save">' + esc(suggestion.alternative.savings) + '</div></div>' : '') +
    '<div class="modules" style="margin-top:12px">' +
    DATA.largestModules.filter(m => m.package === name).slice(0, 12).map(m =>
      '<div class="module"><span>' + esc(m.name) + '</span><b>' + fmt(m.size) + '</b></div>'
    ).join('') +
    '</div>';
  detail.querySelector('.d-close').addEventListener('click', () => { selected = null; detail.style.display = 'none'; cells.forEach(el => el.classList.remove('selected')); });
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const search = document.getElementById('search');
const violationsOnly = document.getElementById('violations');
const swapsOnly = document.getElementById('swaps');
function applyFilters() {
  const q = (search.value || '').toLowerCase().trim();
  cells.forEach((el, name) => {
    const t = DATA.treemap.find(x => x.name === name);
    const matchQ = !q || name.toLowerCase().includes(q);
    const matchV = !violationsOnly.checked || t.finding;
    const matchS = !swapsOnly.checked || t.swap;
    const show = matchQ && matchV && matchS;
    el.classList.toggle('dim', !show);
    el.style.pointerEvents = show ? '' : 'none';
  });
}
search.addEventListener('input', applyFilters);
violationsOnly.addEventListener('change', applyFilters);
swapsOnly.addEventListener('change', applyFilters);

if (DATA.packages.length) {
  renderModules(DATA.packages[0].name);
}
</script>
</body>
</html>`
}
