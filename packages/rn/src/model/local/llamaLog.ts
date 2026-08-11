/**
 * node-llama-cpp log filtering.
 *
 * llama.cpp emits a known-harmless tokenizer notice ("load: control-looking
 * token ...") when Qwen GGUF files load. node-llama-cpp surfaces llama.cpp
 * logs through a `logger` callback on each engine entry point; this module
 * builds one filtered callback (and holds the shared noise-classification
 * helpers) so no CLI run ever prints the noise, while real warnings/errors
 * still surface at the right severity.
 *
 * The stderr write-filter in inference.ts remains as a safety net for writes
 * that bypass the callback entirely (direct fd writes from the native addon).
 */

/** The noise pattern the filter hunts for, split across any number of writes. */
export const NOISE_PATTERN = 'control-looking token'

/**
 * Known-harmless tokenizer noise that must never reach the CLI output. Qwen
 * GGUF files emit a "control-looking token" notice on load (the tokenizer
 * marks 128247 '</s>' as non-control; node-llama-cpp overrides the type).
 * The model works fine — the line just corrupts the spinner output.
 */
export function shouldSuppressStderrLine(line: string): boolean {
  return line.includes(NOISE_PATTERN)
}

/**
 * A held partial longer than this cannot be a split noise line — llama.cpp
 * emits the tokenizer warning as one short line — so it is flushed instead of
 * held. Guards against a newline-less progress write that merely ends in a
 * single-char pattern prefix (e.g. `c`) batching up forever.
 */
export const NOISE_LINE_MAX_LENGTH = NOISE_PATTERN.length + 96

/**
 * True when `partial` — the tail of a line that has not yet seen a newline —
 * could still grow into the noise pattern (i.e. some suffix of it is a prefix
 * of the pattern). Used to decide whether a newline-less chunk must be held
 * back for the next write or can pass straight through.
 */
export function couldBecomeNoiseLine(partial: string): boolean {
  if (partial.length === 0) return false
  const start = Math.max(0, partial.length - NOISE_PATTERN.length)
  for (let i = start; i < partial.length; i++) {
    if (NOISE_PATTERN.startsWith(partial.slice(i))) return true
  }
  return false
}

/**
 * Numeric severity for node-llama-cpp's string LlamaLogLevel values (lower =
 * more severe). Kept local so this module never needs a static import of the
 * optional node-llama-cpp package.
 */
const LLAMA_LOG_SEVERITY: Record<string, number> = {
  disabled: -1,
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  log: 4,
  debug: 5,
}

export interface LlamaLogFilterOptions {
  /** Prefix for re-emitted messages (default `[node-llama-cpp]`). */
  prefix?: string
}

/**
 * Build the `logger` callback passed to node-llama-cpp entry points
 * (getLlama and friends). Drops known-harmless tokenizer noise, re-emits
 * errors/warnings at their real severity, and keeps info/log/debug silent
 * unless VECTALON_DEBUG=1.
 */
export function createLlamaLogFilter(
  options: LlamaLogFilterOptions = {}
): (level: string, message: string) => void {
  const prefix = options.prefix ?? '[node-llama-cpp]'
  // Read the env per call, not at filter creation: the CLI flips
  // VECTALON_DEBUG=1 at runtime (--diagnostics), and a filter created before
  // that would otherwise stay mute on info/debug chatter forever.
  const debugEnabled = (): boolean =>
    process.env.VECTALON_DEBUG === '1' || process.env.VECTALON_DEBUG === 'true'
  return (level, message) => {
    if (shouldSuppressStderrLine(message)) return
    const severity = LLAMA_LOG_SEVERITY[level] ?? 4
    if (severity <= 1) {
      console.error(`${prefix} ${message}`)
    } else if (severity === 2) {
      console.warn(`${prefix} ${message}`)
    } else if (debugEnabled()) {
      console.info(`${prefix} ${message}`)
    }
  }
}
