/**
 * Vectalon RN — Live self-test progress reporter
 * Business Source License 1.1 (BSL-1.1)
 *
 * Streams check results as they finish instead of printing only the final
 * report, so clients see failures the moment they happen.
 *
 *  - TTY: a clack-style spinner + progress bar shows the running check, then
 *    each completed check prints a persistent status line (✔/✖/⚠ + id + detail).
 *  - Non-TTY (pipes, CI): plain status lines stream to stderr — colorized
 *    output is gated on `isTTY`, so logs stay clean and grep-friendly.
 */

import pc from 'picocolors'
import type { CheckRun, CheckStatus, FeatureCheck } from './types'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '✔',
  fail: '✖',
  warn: '⚠',
}

const BAR_WIDTH = 16
const MAX_DETAIL = 90

export interface LiveProgressReporterOptions {
  /** Persistent line sink (defaults to stderr + newline). Injectable for tests. */
  out?: (line: string) => void
  /** Raw chunk sink for the inline spinner/progress line (no newline). */
  raw?: (chunk: string) => void
  /** Force TTY behavior on/off (defaults to process.stderr.isTTY). */
  isTTY?: boolean
}

export class LiveProgressReporter {
  private readonly out: (line: string) => void
  private readonly raw: (chunk: string) => void
  private readonly isTTY: boolean
  private timer: ReturnType<typeof setInterval> | null = null
  private frame = 0
  private total = 0
  private done = 0
  private startedAt = 0
  private current: { name: string } | null = null

  constructor(options: LiveProgressReporterOptions = {}) {
    this.out = options.out || ((line: string) => process.stderr.write(line + '\n'))
    this.raw = options.raw || ((chunk: string) => process.stderr.write(chunk))
    this.isTTY = options.isTTY ?? (typeof process !== 'undefined' && process.stderr.isTTY === true)
  }

  /** Begin a run of `total` checks; starts the spinner in TTY mode. */
  start(total: number): void {
    this.total = total
    this.done = 0
    this.startedAt = Date.now()
    if (this.isTTY) {
      this.timer = setInterval(() => this.render(), 80)
      this.timer.unref?.()
    }
  }

  /** A check is about to run — show it on the spinner/progress line. */
  onCheckStart(check: FeatureCheck): void {
    this.current = { name: check.name }
    if (this.isTTY) this.render()
  }

  /** A check finished — persist its status line and bump the progress bar. */
  onCheckDone(run: CheckRun): void {
    this.done += 1
    this.current = null
    // Colors are gated on isTTY: picocolors detects color support from stdout,
    // but this reporter writes to stderr, so gate explicitly to honor the
    // "no ANSI when piped/CI" contract.
    const statusColor = this.isTTY
      ? (run.status === 'fail' ? pc.red : run.status === 'warn' ? pc.yellow : pc.green)
      : (s: string) => s
    const label = run.status.toUpperCase()
    const detail = run.detail ? ` — ${truncate(run.detail)}` : run.error ? ` — ${truncate(run.error.split('\n')[0])}` : ''
    const line = `${statusColor(STATUS_ICONS[run.status])} ${statusColor(label.padEnd(4))} ${run.check.id.padEnd(32)} ${run.check.name} (${run.durationMs}ms)${detail}`
    if (this.isTTY) this.clear()
    this.out(line)
    if (this.isTTY) this.render()
  }

  /** Stop the spinner and clear the inline line. */
  finish(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.isTTY && this.current) this.clear()
  }

  private render(): void {
    if (!this.current) return
    const spinner = pc.cyan(SPINNER_FRAMES[this.frame++ % SPINNER_FRAMES.length])
    const elapsed = this.startedAt ? Date.now() - this.startedAt : 0
    const secs = (elapsed / 1000).toFixed(1)
    this.raw(`\r\x1b[K${spinner} [${this.done}/${this.total}] ${this.bar()} ${pc.bold(this.current.name)} (${secs}s)`)
  }

  private bar(): string {
    const filled = this.total > 0 ? Math.round((this.done / this.total) * BAR_WIDTH) : 0
    const solid = pc.green('█'.repeat(filled))
    const empty = pc.dim('░'.repeat(BAR_WIDTH - filled))
    return solid + empty
  }

  private clear(): void {
    this.raw('\r\x1b[K')
  }
}

function truncate(value: string, max = MAX_DETAIL): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
