/**
 * Rotating file logger (P1-12).
 *
 * Every `logger.info/warn/error/debug` call is mirrored to a rotating file
 * under `.vectalon/logs/vectalon.log` with an ISO timestamp, capped at 5
 * files × 10 MB (vectalon.log, .1, .2, … .4). This is the foundation for
 * debugging production issues: the file survives the process, so a crash or
 * a closed terminal never loses the tail.
 *
 * Debug lines only reach the file when `VECTALON_DEBUG=1` (the CLI sets it
 * automatically when `--diagnostics` is passed), matching the console
 * behavior. All file I/O is best-effort: a read-only project, a full disk,
 * or a deleted `.vectalon/` never breaks a command.
 *
 * Known limitation: rotation is single-process safe only. A long-lived
 * `vectalon serve`/daemon and a concurrent CLI run pointed at the same
 * `.vectalon/logs/` could both cross the size cap and race the rename shift.
 * Rare in practice; if it ever matters, suffix long-lived processes with
 * `vectalon.<pid>.log`.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'

export const LOG_FILE_NAME = 'vectalon.log'
/** Max size of the active log file before it rotates (10 MB). */
export const LOG_MAX_BYTES = 10 * 1024 * 1024
/** Total retained files: vetalon.log + 4 rotated shards. */
export const LOG_MAX_FILES = 5

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

// Built without a control-character literal to satisfy no-control-regex.
const ANSI_STRIP = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

let currentPath: string | null = null
let maxBytes = LOG_MAX_BYTES

/** Path of the active log file, or null when file logging is not attached. */
export function getLogFilePath(): string | null {
  return currentPath
}

/**
 * Attach file logging rooted at `root` (default cwd), creating
 * `<root>/.vectalon/logs/`. Returns the active log path, or null when the
 * directory cannot be created (never throws). Safe to call repeatedly — the
 * last successful attach wins. `maxBytes` overrides the 10 MB rotation cap
 * (tests use a tiny cap to exercise rotation cheaply).
 */
export function attachFileLogging(root = process.cwd(), options: { maxBytes?: number } = {}): string | null {
  try {
    const dir = join(root, '.vectalon', 'logs')
    mkdirSync(dir, { recursive: true })
    currentPath = join(dir, LOG_FILE_NAME)
    maxBytes = options.maxBytes ?? LOG_MAX_BYTES
    return currentPath
  } catch {
    currentPath = null
    return null
  }
}

/** Detach file logging (used by tests; harmless in production). */
export function detachFileLogging(): void {
  currentPath = null
  maxBytes = LOG_MAX_BYTES
}

/**
 * Append one ISO-timestamped line to the active log file, rotating when the
 * current file exceeds `LOG_MAX_BYTES`. Best-effort: never throws.
 */
export function writeLogLine(level: LogLevel, message: string): void {
  if (!currentPath) return
  try {
    const line = `${new Date().toISOString()} [${level}] ${message.replace(ANSI_STRIP, '').trim()}\n`
    appendFileSync(currentPath, line)
    rotateIfNeeded()
  } catch {
    // File logging is best-effort — never break a command on log I/O.
  }
}

/** Rotate when the active file exceeds the cap: shift .4 → drop, … .1 → .2. */
function rotateIfNeeded(): void {
  if (!currentPath) return
  try {
    if (statSync(currentPath).size <= maxBytes) return
    const dir = dirname(currentPath)
    for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? currentPath : join(dir, `${LOG_FILE_NAME}.${i - 1}`)
      const to = join(dir, `${LOG_FILE_NAME}.${i}`)
      if (existsSync(from)) {
        rmSync(to, { force: true })
        renameSync(from, to)
      }
    }
  } catch {
    // Rotation is best-effort too.
  }
}
