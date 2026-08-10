/**
 * Terminal table renderer — ANSI-aware, word-wrapping, truncation-free.
 *
 * cli-table truncates long cells with `…` at fixed column widths, which is how
 * doctor hints like "Install with: npx @ohah/react-native-mcp-…" get mangled.
 * This renderer instead word-wraps every cell (color codes don't count toward
 * width) and lets columns grow to their content, so nothing is ever elided.
 */

import pc from 'picocolors'

// Built dynamically to avoid the no-control-regex lint rule.
const ESC = String.fromCharCode(27)
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

/** Visible width of a string with ANSI color codes stripped. */
export function visibleWidth(text: string): number {
  return text.replace(ANSI_RE, '').length
}

/** Split an ANSI-colored line into a list of (text, prefix, suffix) runs. */
interface ColoredRun {
  prefix: string
  text: string
  suffix: string
}

function coloredRuns(line: string): ColoredRun[] {
  const runs: ColoredRun[] = []
  let current = ''
  let prefix = ''
  let suffix = ''
  let inCode = false
  let code = ''

  for (const ch of line) {
    if (inCode) {
      code += ch
      if (ch === 'm') {
        inCode = false
        if (current.length > 0) {
          runs.push({ prefix, text: current, suffix: code })
          current = ''
          suffix = code
        } else {
          // A code with no text before it is an opening sequence, not a
          // closing one — it must not be reused as this run's suffix.
          prefix += code
        }
        code = ''
      }
      continue
    }
    if (ch === '\u001b') {
      inCode = true
      code = '\u001b'
      continue
    }
    current += ch
  }
  if (inCode) {
    suffix += code
  }
  if (current.length > 0) {
    runs.push({ prefix, text: current, suffix })
  }
  return runs
}

/** Word-wrap a single ANSI-colored line to `width` visible columns. */
function wrapLine(line: string, width: number): string[] {
  if (visibleWidth(line) <= width) return [line]
  const words = line.split(/(\s+)/)
  const out: string[] = []
  let current = ''
  let currentWidth = 0

  const flush = (): void => {
    if (current.length > 0) {
      out.push(current)
      current = ''
      currentWidth = 0
    }
  }

  for (const word of words) {
    const w = visibleWidth(word)
    if (w === 0 && current.length === 0) continue
    if (currentWidth + w > width && currentWidth > 0) {
      flush()
    }
    current += word
    currentWidth += w
  }
  flush()
  return out.length > 0 ? out : ['']
}

/**
 * Wrap a possibly multi-line cell to `width` visible columns, preserving ANSI
 * colors across the wrap (each wrapped line re-applies the color prefix).
 */
function wrapCell(cell: string, width: number): string[] {
  const lines: string[] = []
  for (const rawLine of cell.split('\n')) {
    const runs = coloredRuns(rawLine)
    // Rebuild as plain segments so we can re-color after wrapping.
    const plain = rawLine.replace(ANSI_RE, '')
    const wrapped = wrapLine(plain, width)
    for (const wl of wrapped) {
      // Re-apply the original color codes per wrapped line by walking runs.
      let colored = ''
      let cursor = 0
      for (const run of runs) {
        const start = cursor
        cursor += run.text.length
        if (wl.length <= start) break
        const slice = wl.slice(start, Math.min(cursor, wl.length))
        if (slice.length > 0) colored += run.prefix + slice + run.suffix
      }
      lines.push(colored || wl)
    }
  }
  return lines
}

export interface TableOptions {
  /** Header cells. When present, rows are padded to this many columns. */
  head?: string[]
  /** Optional per-column visible-width cap (default 60). */
  colWidths?: number[]
  /** Padding on each side of a cell (default 1). */
  padding?: number
}

/**
 * Render a boxed table. Column widths are the max visible width of any cell
 * (capped at `colWidths[i]` or 60); every cell word-wraps so long hints are
 * fully visible. Returns the string ready for stdout.
 */
export function renderTable(rows: Array<Array<string | number>>, options: TableOptions = {}): string {
  const padding = options.padding ?? 1
  const columnCount = Math.max(options.head?.length ?? 0, ...rows.map(r => r.length))
  if (columnCount === 0) return ''

  const all: string[][] = [
    ...(options.head ? [options.head] : []),
    ...rows.map(r => {
      const row = new Array<string>(columnCount).fill('')
      for (let i = 0; i < columnCount; i++) {
        row[i] = String(r[i] ?? '')
      }
      return row
    }),
  ]

  // Compute column widths (visible), capped per column.
  const widths = new Array<number>(columnCount).fill(0)
  for (const row of all) {
    for (let i = 0; i < columnCount; i++) {
      const w = Math.max(...row[i].split('\n').map(l => visibleWidth(l)))
      if (w > widths[i]) widths[i] = Math.min(w, options.colWidths?.[i] ?? 60)
    }
  }

  // Wrap every cell into a column of wrapped lines.
  const wrapped: string[][][] = all.map(row => row.map((cell, i) => wrapCell(cell, widths[i])))
  const pad = ' '.repeat(padding)

  /** Render one logical row (array of wrapped-cell line-arrays) across all rows. */
  const renderRowCells = (wrappedRow: string[][]): string[] => {
    const rowHeight = Math.max(...wrappedRow.map(c => c.length))
    const lines: string[] = []
    for (let lineIdx = 0; lineIdx < rowHeight; lineIdx++) {
      const parts: string[] = []
      for (let i = 0; i < columnCount; i++) {
        const content = wrappedRow[i][lineIdx] ?? ''
        const gap = ' '.repeat(widths[i] - visibleWidth(content))
        parts.push(pad + content + gap + pad)
      }
      lines.push('│' + parts.join('│') + '│')
    }
    return lines
  }

  const renderSeparator = (left: string, mid: string, right: string): string => {
    const parts = widths.map(w => '─'.repeat(w + padding * 2))
    return left + parts.join(mid) + right
  }

  const out: string[] = []
  out.push(renderSeparator('┌', '┬', '┐'))
  if (options.head) {
    out.push(...renderRowCells(wrapped[0]))
    out.push(renderSeparator('├', '┼', '┤'))
  }
  const bodyStart = options.head ? 1 : 0
  for (let r = bodyStart; r < wrapped.length; r++) {
    out.push(...renderRowCells(wrapped[r]))
    if (r < wrapped.length - 1) out.push(renderSeparator('├', '┼', '┤'))
  }
  out.push(renderSeparator('└', '┴', '┘'))
  return out.join('\n')
}

/** Quick success/warn/error coloring helper for status cells. */
export function colorStatus(status: string): string {
  switch (status) {
    case 'OK':
    case 'ok':
      return pc.green('OK')
    case 'MISSING':
    case 'missing':
      return pc.red('MISSING')
    case 'WARN':
    case 'warning':
      return pc.yellow('WARN')
    case 'FIXED':
      return pc.green('FIXED')
    case 'FAILED':
      return pc.red('FAILED')
    case 'SKIPPED':
      return pc.yellow('SKIPPED')
    default:
      return status
  }
}
