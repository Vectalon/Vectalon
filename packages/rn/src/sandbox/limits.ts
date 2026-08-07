/**
 * POSIX rlimit wrapper — CPU / memory / file-size / descriptor / process caps
 * Business Source License 1.1 (BSL-1.1)
 *
 * Node's child_process has no rlimit API, so we wrap the command in a `sh -c`
 * that applies `ulimit` before exec'ing the real command. Each limit is
 * best-effort (`|| true`-style via `2>/dev/null` and no `-e`), so an
 * unsupported limit on some platform never aborts the wrapper.
 */

import type { SandboxOptions } from './types'

/**
 * Build the `sh -c` wrapper script that applies rlimits then execs the real
 * command. The command and its args are passed positionally, so they are
 * never interpolated into the script (no shell-injection surface).
 */
export function buildLimitWrapper(options: SandboxOptions): string {
  const limits: string[] = []
  if (typeof options.cpuSeconds === 'number' && options.cpuSeconds > 0) {
    limits.push(`ulimit -t ${Math.ceil(options.cpuSeconds)} 2>/dev/null`)
  }
  if (typeof options.memoryMb === 'number' && options.memoryMb > 0) {
    limits.push(`ulimit -v ${Math.ceil(options.memoryMb) * 1024} 2>/dev/null`)
  }
  if (typeof options.fileSizeMb === 'number' && options.fileSizeMb > 0) {
    limits.push(`ulimit -f ${Math.ceil(options.fileSizeMb) * 1024} 2>/dev/null`)
  }
  const openFiles = options.maxOpenFiles ?? 128
  limits.push(`ulimit -n ${openFiles} 2>/dev/null`)
  const processes = options.maxProcesses ?? 64
  limits.push(`ulimit -u ${processes} 2>/dev/null`)
  limits.push('exec "$0" "$@"')
  return limits.join('; ')
}

/** Shell args: `sh -c <script> <command> <args...>` with $0 = command. */
export function buildShellArgs(command: string, args: string[], script: string): string[] {
  return ['-c', script, command, ...args]
}
