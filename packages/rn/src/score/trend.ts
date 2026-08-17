/**
 * vc score — trend chart rendering.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The recurring-product piece: a box-drawn ASCII polyline of the last runs'
 * overall scores (two grid columns per run — the point and its rightward
 * connector), with a y axis every 10 points (plus the exact data values so
 * markers never vanish) and a centered date legend below. Pure string output
 * so the terminal command and the hermetic tests share the exact same
 * rendering.
 */
import type { ScoreTrendPoint } from './types'

export type { ScoreTrendPoint } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Compact date label for one entry, e.g. `Aug 1` (UTC for determinism). */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** Axis tick label, e.g. `8/1` — short enough for the tight grid. */
export function axisDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/** Row window: round min/max to the nearest 10 with headroom, clamped 0-100. */
export function trendWindow(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 100 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return {
    min: Math.max(0, Math.floor((lo - 5) / 10) * 10),
    max: Math.min(100, Math.ceil((hi + 5) / 10) * 10),
  }
}

/**
 * Draw one row of the polyline: two columns per point — the point glyph
 * (corner / flat / vertical) plus a `─` connector when the segment is flat.
 * A corner arriving from the left (`╮` rising in, `╯` falling in) wins over
 * a flat-out at a plateau corner; the newest point is always `●`.
 */
function rowLine(values: number[], n: number, rv: number): string {
  const grid: string[] = Array.from({ length: 2 * n }, () => ' ')
  const arrivals: Array<'╮' | '╯' | null> = Array.from({ length: n }, () => null)

  for (let i = 0; i < n - 1; i++) {
    const vi = values[i]
    const vj = values[i + 1]
    if (rv === vi) {
      grid[2 * i] = vj > vi ? '╰' : vj < vi ? '╭' : '─'
      if (vj === vi) grid[2 * i + 1] = '─'
    } else if (rv === vj) {
      arrivals[i + 1] = vj > vi ? '╮' : '╯'
    } else if (rv > Math.min(vi, vj) && rv < Math.max(vi, vj)) {
      grid[2 * i] = '│'
      grid[2 * i + 1] = '│'
    }
  }

  for (let i = 1; i < n; i++) {
    const a = arrivals[i]
    if (a && grid[2 * i] === '─') grid[2 * i] = a
  }
  // The newest point (the current run) is always marked — on its own row only.
  if (rv === values[n - 1]) grid[2 * (n - 1)] = '●'

  return grid.join('')
}

/**
 * The date legend under the x axis: first, last, and up to three
 * evenly-spaced middle dates, centered on its own line (it may be wider
 * than the chart itself on narrow runs — the carbon window wraps far
 * wider).
 */
function labelAxis(points: ScoreTrendPoint[], gutter: number): string {
  const n = points.length
  const idx = new Set<number>([0, n - 1])
  const want = Math.min(5, n)
  for (let k = 1; k <= want - 2; k++) idx.add(Math.round((k * (n - 1)) / (want - 1)))
  const sorted = [...idx].sort((a, b) => a - b)
  const legend = sorted.map(i => axisDate(points[i].scoredAt)).join(' · ')

  const chartWidth = gutter + 1 + 2 * n
  const width = Math.max(chartWidth, gutter + 1 + legend.length)
  const start = gutter + 1 + Math.max(0, Math.floor((chartWidth - legend.length) / 2))
  const row = ' '.repeat(width).split('')
  for (let k = 0; k < legend.length; k++) {
    if (start + k < width) row[start + k] = legend[k]
  }
  return row.join('').replace(/\s+$/, '')
}

/**
 * Render the overall-score polyline as body lines (no outer indent — the
 * caller adds spacing). Empty when there are no points.
 */
export function renderTrendChart(points: ScoreTrendPoint[], gutter = 4): string[] {
  const n = points.length
  if (n === 0) return []
  const values = points.map(p => p.overall)
  const { min, max } = trendWindow(values)
  // Every point value must land on a row or its marker/connector vanishes;
  // the 10-step rows keep the axis readable, the exact values keep the line.
  const rowSet = new Set<number>()
  for (let v = max; v >= min; v -= 10) rowSet.add(v)
  for (const v of values) rowSet.add(v)
  const rows = [...rowSet].sort((a, b) => b - a)

  const label = (v: number): string => (v % 10 === 0 ? String(v).padStart(gutter) : ' '.repeat(gutter))
  const out: string[] = []
  for (const rv of rows) out.push(`${label(rv)}┤${rowLine(values, n, rv)}`)
  out.push(`${' '.repeat(gutter)}└${'─'.repeat(2 * n)}`)
  out.push(labelAxis(points, gutter))
  return out
}
