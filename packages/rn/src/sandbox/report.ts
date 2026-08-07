/**
 * Sandbox result rendering
 * Business Source License 1.1 (BSL-1.1)
 */

import type { SandboxResult } from './types'

/** Human-readable report of a sandboxed run for the CLI / logs. */
export function renderSandboxResult(result: SandboxResult): string {
  const lines: string[] = []
  const status = result.ok ? 'ok' : result.timedOut ? 'timed out' : result.error ? 'failed to spawn' : `exit ${result.exitCode}`
  lines.push(`status: ${status}`)
  lines.push(`isolation: ${result.isolation}${result.timedOut ? ' (killed after timeout)' : ''}`)
  if (result.durationMs > 0) lines.push(`duration: ${result.durationMs}ms`)
  if (result.signal) lines.push(`signal: ${result.signal}`)
  if (result.droppedEnv.length > 0) {
    lines.push(`env scrubbed: dropped ${result.droppedEnv.length} variable(s): ${result.droppedEnv.join(', ')}`)
  } else {
    lines.push('env scrubbed: nothing dropped')
  }
  if (result.stdout) {
    lines.push('')
    lines.push('--- stdout ---')
    lines.push(result.stdoutTruncated ? result.stdout + '\n…(truncated)' : result.stdout)
  }
  if (result.stderr) {
    lines.push('')
    lines.push('--- stderr ---')
    lines.push(result.stderrTruncated ? result.stderr + '\n…(truncated)' : result.stderr)
  }
  if (result.error) {
    lines.push('')
    lines.push(`error: ${result.error}`)
  }
  return lines.join('\n')
}
