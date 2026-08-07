/**
 * vectalon upgrade — project file walking helpers
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { reportError } from '../utils/safe'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'build', 'dist', '.expo', 'Pods', 'DerivedData',
  'xcuserdata', '.gradle', '.cxx', 'coverage', '.vectalon', '.turbo',
  'android/app/build', 'ios/build',
])

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/** Walk a project tree, returning source-file paths relative to `root`. */
export function walkProjectFiles(root: string, exts = SOURCE_EXTS): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (err) {
      reportError(err, `upgrade: reading directory ${dir}`)
      continue
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch (err) {
        reportError(err, `upgrade: statting ${full}`)
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
      } else if (exts.has(entry.slice(entry.lastIndexOf('.')))) {
        out.push(relative(root, full))
      }
    }
  }
  return out.sort()
}

/** Read a file inside the project root; null when missing/unreadable. */
export function readProjectFile(root: string, relPath: string): string | null {
  const full = join(root, relPath)
  if (!existsSync(full)) return null
  try {
    return readFileSync(full, 'utf-8') as string
  } catch (err) {
    reportError(err, `upgrade: reading ${relPath}`)
    return null
  }
}

/** True when a source file (or any scanned file) mentions `pattern`. */
export function projectHasPattern(root: string, pattern: RegExp, exts = SOURCE_EXTS): boolean {
  return walkProjectFiles(root, exts).some(rel => {
    const content = readProjectFile(root, rel)
    if (content === null) return false
    pattern.lastIndex = 0
    return pattern.test(content)
  })
}
