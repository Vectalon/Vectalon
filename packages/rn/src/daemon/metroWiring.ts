import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'

export interface WireResult {
  wired: boolean
  file?: string
  reason?: string
}

/**
 * Patch `metro.config.js` / `metro.config.cjs` to route Metro build events to
 * the daemon reporter. Idempotent (a second call sees the marker and no-ops)
 * and best-effort: only the simple `module.exports = { ... }` shape is
 * patched; anything else is reported with a manual hint rather than mangled.
 */
export function wireMetroReporter(root: string): WireResult {
  for (const name of ['metro.config.js', 'metro.config.cjs']) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    try {
      const original = readFileSync(file, 'utf-8')
      if (original.includes('vectalon-reporter')) {
        return { wired: false, file, reason: 'already-wired' }
      }
      const marker = 'module.exports = {'
      const idx = original.indexOf(marker)
      if (idx === -1) {
        return { wired: false, file, reason: 'unrecognized-config-shape' }
      }
      const insertAt = idx + marker.length
      const patched =
        original.slice(0, insertAt) +
        `\n  reporter: require('./.vectalon/metro/vectalon-reporter.js'),` +
        original.slice(insertAt)
      writeFileSync(file, patched)
      return { wired: true, file }
    } catch (err) {
      reportError(err, `daemon: wiring metro reporter into ${file}`, 'warn')
      return { wired: false, file, reason: 'write-failed' }
    }
  }
  return { wired: false, reason: 'no-metro-config' }
}
