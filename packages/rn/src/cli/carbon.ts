/**
 * Carbon-style terminal window for agent command output.
 *
 * Renders a box-drawn "window" with traffic-light dots, a title bar, a
 * verdict chip, and a bordered body — the terminal analog of the carbon
 * report windows on vectalon.in. Uses 24-bit true color when the terminal
 * supports it (COLORTERM=truecolor / xterm-direct / modern TERM_PROGRAM)
 * and degrades to the standard ANSI palette otherwise. No color when the
 * terminal or NO_COLOR forbids it.
 */

import pc from 'picocolors'
import { logger } from './logger'

// Control character built without a literal to satisfy no-control-regex.
const ESC = String.fromCharCode(27)
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

const rgb = (r: number, g: number, b: number, text: string): string =>
  `${ESC}[38;2;${r};${g};${b}m${text}${ESC}[0m`
const rgbBg = (r: number, g: number, b: number, text: string): string =>
  `${ESC}[48;2;${r};${g};${b}m${text}${ESC}[0m`

// The site's own world, in ANSI: warm parchment on the fixed dark surface.
const PARCHMENT: [number, number, number] = [232, 224, 200]
const DIM: [number, number, number] = [139, 148, 158]

const DOTS: Array<[number, number, number]> = [
  [255, 95, 86],
  [255, 189, 46],
  [39, 201, 63],
]

/** True-color support: modern terminals advertise it via COLORTERM/TERM. */
export function supportsTrueColor(): boolean {
  if (!pc.isColorSupported) return false
  const colorterm = (process.env.COLORTERM ?? '').toLowerCase()
  if (colorterm === 'truecolor' || colorterm === '24bit') return true
  const term = process.env.TERM ?? ''
  if (/xterm-(direct|truecolor)|truecolor|24bit/i.test(term)) return true
  const prog = (process.env.TERM_PROGRAM ?? '').toLowerCase()
  return ['iterm.app', 'wezterm', 'ghostty', 'hyper', 'alacritty', 'kitty', 'jetbrains'].includes(prog)
}

const TC = supportsTrueColor()

/** Style a chunk in a palette color (truecolor when available). */
function paint(c: [number, number, number], text: string): string {
  return TC ? rgb(c[0], c[1], c[2], text) : text
}

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/** Visible width of a string, ignoring ANSI codes and counting CJK double-width. */
export function visibleWidth(s: string): number {
  let w = 0
  for (const ch of stripAnsi(s)) {
    const code = ch.codePointAt(0) ?? 0
    w += code > 0x2e7f ? 2 : 1
  }
  return w
}

interface Tok {
  kind: 'text' | 'ansi'
  value: string
}

/** Split a styled string into text and ANSI tokens. */
function tokenize(s: string): Tok[] {
  const out: Tok[] = []
  let last = 0
  ANSI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ANSI_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: s.slice(last, m.index) })
    out.push({ kind: 'ansi', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ kind: 'text', value: s.slice(last) })
  return out
}

/**
 * Wrap styled text to a visible width, carrying the open ANSI styles onto
 * continuation lines so colors never bleed or vanish at a wrap point.
 */
function wrapText(text: string, width: number): string[] {
  // Word groups: ANSI codes glue to the following word.
  const words: Tok[][] = []
  let cur: Tok[] = []
  const pushWord = () => {
    if (cur.length > 0) words.push(cur)
    cur = []
  }
  for (const t of tokenize(text)) {
    if (t.kind === 'ansi') {
      cur.push(t)
      continue
    }
    const parts = t.value.split(/(\s+)/)
    for (const part of parts) {
      if (part === '') continue
      if (/^\s+$/.test(part)) {
        cur.push({ kind: 'text', value: part })
        continue
      }
      pushWord()
      cur = [{ kind: 'text', value: part }]
    }
  }
  pushWord()

  const out: string[] = []
  let line = ''
  let lineW = 0
  let open = '' // ANSI codes opened since the last reset in this line
  const flush = (force: boolean) => {
    if (line.length > 0 || force) {
      // Close any style left open at the break so the padding and borders
      // render plain; the continuation reopens it below. Plain text never
      // gains codes (NO_COLOR / piped logs must stay clean).
      out.push(line + (open ? `${ESC}[0m` : ''))
      line = ''
      lineW = 0
    }
  }

  for (const word of words) {
    let wordW = 0
    for (const t of word) if (t.kind === 'text') wordW += visibleWidth(t.value)

    if (lineW + wordW > width && lineW > 0) {
      flush(false)
      // Continuation reopens the styles that were open at the break.
      line = open
    }
    for (const t of word) {
      if (t.kind === 'ansi') {
        line += t.value
        if (t.value === `${ESC}[0m`) open = ''
        else open += t.value
      } else {
        line += t.value
        lineW += visibleWidth(t.value)
      }
    }
  }
  flush(true)
  return out.length > 0 ? out : ['']
}

/** The three traffic lights as a single styled run (truecolor fills). */
function carbonDots(): string {
  if (TC) return DOTS.map(d => rgbBg(d[0], d[1], d[2], ' ')).join('') + ' '
  return '● ● ● '
}

/** A verdict chip: filled label on the status color, readable on dark. */
export function verdictChip(verdict: string): string {
  const label = ` ${verdict} `
  if (verdict === 'approved') return TC ? rgbBg(63, 185, 80, rgb(12, 20, 14, label)) : pc.green(pc.bold(label))
  if (verdict === 'needs-attention') return TC ? rgbBg(244, 164, 96, rgb(28, 22, 10, label)) : pc.yellow(pc.bold(label))
  return TC ? rgbBg(227, 83, 54, rgb(30, 14, 8, label)) : pc.red(pc.bold(label))
}

export interface CarbonWindowOptions {
  /** Title bar text, e.g. `vectalon sec — Security Review Agent`. */
  title: string
  /** Optional verdict → colored chip on the right of the title bar. */
  verdict?: string
  /** Body lines (already styled). Long lines wrap at the window width. */
  lines: string[]
  /** Optional footer text drawn inside the bottom bar. */
  footer?: string
}

/**
 * Render the carbon window as one string. The window width follows the
 * terminal (columns - 2, clamped to [40, 120]); every body line is wrapped
 * and bordered, so a pipe into a log or file still reads as a box.
 */
export function renderCarbonWindow(opts: CarbonWindowOptions): string {
  const cols = process.stdout.columns
  const inner = Math.max(40, Math.min(cols && cols > 2 ? cols - 2 : 78, 120))

  const dots = carbonDots()
  const titleText = paint(PARCHMENT, opts.title)
  const chip = opts.verdict ? ` ${verdictChip(opts.verdict)} ` : ''
  const left = visibleWidth(dots) + visibleWidth(titleText) + 2
  const right = chip ? visibleWidth(chip) + 2 : 0
  const fill = Math.max(1, inner - left - right)
  const top = `┌─${dots}${titleText}${'─'.repeat(fill)}${chip}─┐`

  const body: string[] = []
  for (const raw of opts.lines) {
    for (const w of wrapText(raw, inner)) {
      const pad = inner - visibleWidth(w)
      body.push(`│ ${w}${pad > 0 ? ' '.repeat(pad) : ''} │`)
    }
  }

  const bottomText = opts.footer ? ` ${opts.footer} ` : ''
  const bottomFill = Math.max(1, inner - visibleWidth(bottomText))
  const bottom = `└─${'─'.repeat(bottomFill)}${bottomText}─┘`

  return [top, ...body, bottom].join('\n')
}

/** Warm parchment body text — the report-window reading color. */
export function parchment(text: string): string {
  return paint(PARCHMENT, text)
}

export function dim(text: string): string {
  return paint(DIM, text)
}

/**
 * One-call helper for agent commands: builds the window from the title,
 * verdict, body lines, and report path, prints it, then the optional
 * success line.
 */
export function printCarbonReport(opts: {
  title: string
  verdict?: string
  lines: string[]
  reportPath: string
  root: string
  done?: string
  /** Optional footer text drawn inside the bottom bar (e.g. an HTML path). */
  footer?: string
}): void {
  const body = [`project: ${opts.root}`, '', ...opts.lines, '', `Report: ${pc.dim(opts.reportPath)}`]
  logger.info(renderCarbonWindow({ title: opts.title, verdict: opts.verdict, lines: body, footer: opts.footer }))
  if (opts.done) logger.success(opts.done)
}
