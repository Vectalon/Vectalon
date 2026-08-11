/**
 * Best-effort cross-platform browser opener — shared by commands that write an
 * HTML dashboard (selftest, bundle). Opening the browser must never throw or
 * block the CLI, so the child process is detached and errors are swallowed.
 * Business Source License 1.1 (BSL-1.1)
 */

import { spawn } from 'child_process'

export function openInBrowser(path: string): void {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path]
  try {
    spawn(opener, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    // Opening the browser is best-effort.
  }
}
