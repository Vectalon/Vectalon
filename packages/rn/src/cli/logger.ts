import pc from 'picocolors'
import { writeLogLine } from './logfile'

/**
 * In-memory ring buffer of the last N log lines (ANSI codes stripped). The
 * `--diagnostics` bundle and `vectalon support --upload` read this so a
 * support ticket can carry the tail of what the harness actually printed,
 * without requiring a file on disk.
 */
const RING_MAX = 5000
const RING: string[] = []

// Built without a control-character literal to satisfy no-control-regex.
const ANSI_STRIP = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

function stripAnsi(msg: string): string {
  return msg.replace(ANSI_STRIP, '')
}

function pushRing(msg: string): void {
  RING.push(stripAnsi(msg))
  if (RING.length > RING_MAX) RING.splice(0, RING.length - RING_MAX)
}

/** Last N ring-buffer lines (default: all), newest last. */
export function getLogLines(max = RING_MAX): string[] {
  return RING.slice(-max)
}

export const logger = {
  info(msg: string): void {
    pushRing(msg)
    writeLogLine('info', msg)
    process.stderr.write(`${pc.cyan('ℹ')} ${msg}\n`)
  },

  success(msg: string): void {
    pushRing(msg)
    writeLogLine('info', msg)
    process.stderr.write(`${pc.green('✔')} ${msg}\n`)
  },

  warn(msg: string): void {
    pushRing(msg)
    writeLogLine('warn', msg)
    process.stderr.write(`${pc.yellow('⚠')} ${msg}\n`)
  },

  /** Debug trace; silent unless VECTALON_DEBUG=1 (used by reportError). */
  debug(msg: string): void {
    pushRing(msg)
    const enabled = process.env.VECTALON_DEBUG === '1' || process.env.VECTALON_DEBUG === 'true'
    if (enabled) {
      writeLogLine('debug', msg)
      process.stderr.write(`${pc.dim('·')} ${msg}\n`)
    }
  },

  error(msg: string): void {
    pushRing(msg)
    writeLogLine('error', msg)
    process.stderr.write(`${pc.red('✖')} ${msg}\n`)
  },

  step(n: number, msg: string): void {
    pushRing(msg)
    writeLogLine('info', msg)
    process.stderr.write(`${pc.blue(`[${n}]`)} ${msg}\n`)
  },

  dim(msg: string): void {
    pushRing(stripAnsi(msg))
    writeLogLine('info', msg)
    process.stderr.write(pc.dim(msg) + '\n')
  },

  raw(msg: string): void {
    process.stderr.write(msg)
  },

  out(msg: string): void {
    process.stdout.write(msg)
  },

  group(title: string, lines: string[]): void {
    process.stderr.write(pc.bold(title) + '\n')
    for (const line of lines) {
      process.stderr.write(`  ${line}\n`)
    }
  },
}
