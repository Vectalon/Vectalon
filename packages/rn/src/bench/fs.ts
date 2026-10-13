import { readdirSync } from 'fs'
import { join } from 'path'

/** Benchmark packs use normalized, portable paths beneath a fresh temp root. */
export function isBenchmarkPath(file: string): boolean {
  // eslint-disable-next-line no-control-regex -- Reject NUL and control characters in untrusted paths.
  return typeof file === 'string' && !/[\\:\x00-\x1f]/.test(file)
    && file.split('/').every(part => part.length > 0 && part !== '.' && part !== '..')
}

/**
 * Recursively collect every `*.json` file under `dir` (sorted, depth-first), so
 * custom scenario/reference packs can nest files in subdirectories (e.g.
 * `my-evals/forms/*.json`) without a flat-file requirement. Uses `Dirent`s so
 * no per-entry `statSync` is needed and dangling symlinks / unreadable entries
 * never crash the walk.
 */
export function collectJsonFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(current, entry.name))
      } else if (entry.name.endsWith('.json')) {
        files.push(join(current, entry.name))
      }
    }
  }
  walk(dir)
  return files.sort()
}
