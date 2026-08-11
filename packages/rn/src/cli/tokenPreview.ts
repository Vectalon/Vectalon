/**
 * Live token preview sink for long model-backed commands (`vectalon bench
 * --model ...`). Each `onTextChunk` callback rewrites a single stderr line
 * with a ticking character count + truncated text preview, so a leaderboard
 * pass shows the model actually generating instead of a frozen "generating…"
 * line. Cleared on scenario completion so settled lines print cleanly.
 *
 * TTY-aware and auto-disabled for `--json` / piped output so structured or
 * CI output stays byte-clean (the sink writes only to stderr, but the
 * `\r`-overwrite animation is meaningless outside a terminal).
 */

export interface TokenPreviewSink {
  /** Feed one decoded text chunk from the model. */
  push: (text: string) => void
  /** Clear the live preview line (before printing a settled line). */
  clear: () => void
}

/** Injectable stderr writer (tests capture writes instead of the real fd). */
type WriteFn = (chunk: string) => void

export function createTokenPreviewSink(
  enabled: boolean,
  write: WriteFn = chunk => process.stderr.write(chunk)
): TokenPreviewSink {
  if (!enabled) {
    return { push: () => {}, clear: () => {} }
  }

  let chars = 0
  let preview = ''

  return {
    push(text: string) {
      chars += text.length
      // Keep a running single-line preview: collapse whitespace, cap the tail.
      preview = (preview + text).replace(/\s+/g, ' ').trim().slice(-160)
      const shown = preview.length > 120 ? `…${preview.slice(-120)}` : preview
      // \r + erase-line, then the ticker. One line, overwritten each chunk.
      write(`\r\x1b[2K⏺ ${chars.toLocaleString()} chars · ${shown}`)
    },
    clear() {
      write('\r\x1b[2K')
    },
  }
}
