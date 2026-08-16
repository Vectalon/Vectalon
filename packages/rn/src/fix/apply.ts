/**
 * vc fix — apply: apply the planned edits in a throwaway sandbox copy (never
 * touching the real tree by default), produce the exact diff, and — only with
 * --apply on a clean git tree — write the edits in place.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'fs'
import { tmpdir } from 'os'
import { join, sep } from 'path'
import { reportError } from '../utils/safe'
import { runCommand } from '../adapters/runCommand'
import type { CommandResult } from '../adapters/runCommand'
import { unifiedDiff } from './diff'
import type { FixEdit } from './types'

export interface ApplyResult {
  /** The sandbox copy where edits were applied (removed at end of run). */
  sandbox: string
  /** Edits that actually changed the file. */
  applied: FixEdit[]
  /** Unified diff of applied edits (paths relative to the project root). */
  diff: string
}

/** Directories never copied into the sandbox (they are big or private). */
const EXCLUDED = new Set([
  'node_modules', '.git', '.vectalon', 'docs', 'build', 'dist', 'coverage', '.expo',
  'Pods', '.gradle', 'ios/Pods', 'android/.gradle', 'android/app/build', 'android/build', '.DS_Store',
])

function shouldCopy(relPath: string): boolean {
  const parts = relPath.split(sep).filter(Boolean)
  return !parts.some(p => EXCLUDED.has(p))
}

/** Copy the project into a fresh temp dir (excluded dirs skipped). */
export function makeSandbox(root: string): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'vectalon-fix-'))
  try {
    cpSync(root, sandbox, {
      recursive: true,
      filter: (src) => {
        const rel = src === root ? '' : src.slice(root.length + 1)
        return rel === '' || shouldCopy(rel)
      },
    })
  } catch (err) {
    reportError(err, 'vc fix: copying project into sandbox')
  }
  return sandbox
}

/** Apply edits to a directory; literal `from` must exist or the edit is skipped. */
export function applyEdits(dir: string, edits: FixEdit[]): { applied: FixEdit[]; skipped: FixEdit[] } {
  const applied: FixEdit[] = []
  const skipped: FixEdit[] = []
  for (const e of edits) {
    const p = join(dir, e.file)
    if (!existsSync(p)) {
      skipped.push(e)
      continue
    }
    try {
      const content = readFileSync(p, 'utf-8')
      const idx = content.indexOf(e.from)
      if (idx === -1) {
        skipped.push(e)
        continue
      }
      const next =
        e.op === 'replace' ? content.slice(0, idx) + e.to + content.slice(idx + e.from.length)
        : content.slice(0, idx + e.from.length) + e.to + content.slice(idx + e.from.length)
      writeFileSync(p, next)
      applied.push(e)
    } catch (err) {
      reportError(err, `vc fix: applying edit to ${e.file}`)
      skipped.push(e)
    }
  }
  return { applied, skipped }
}

/** Diff the edited files (original root vs the sandbox/edited tree). */
export function diffEdits(root: string, editedDir: string, applied: FixEdit[]): string {
  const parts: string[] = []
  for (const e of applied) {
    const oldC = safeRead(join(root, e.file))
    const newC = safeRead(join(editedDir, e.file))
    if (oldC === newC) continue
    parts.push(unifiedDiff(e.file, oldC, newC))
  }
  return parts.join('\n')
}

function safeRead(p: string): string {
  try {
    return existsSync(p) ? readFileSync(p, 'utf-8') : ''
  } catch {
    return ''
  }
}

/** Is the git tree clean? (Non-git dirs count as clean.) */
export async function treeClean(root: string, run: (cmd: string, args: string[], opts: { cwd: string; timeout?: number }) => Promise<CommandResult> = runCommand): Promise<boolean> {
  const r = await run('git', ['status', '--porcelain'], { cwd: root })
  return r.success && r.stdout.trim() === ''
}

/**
 * Write the edits to the real tree. Refuses a dirty tree unless force. The
 * sandbox is the apply target unless `apply` is set — this is the only path
 * that touches the user's project.
 */
export async function applyToTree(root: string, edits: FixEdit[], force: boolean, run: (cmd: string, args: string[], opts: { cwd: string; timeout?: number }) => Promise<CommandResult> = runCommand): Promise<{ applied: FixEdit[]; refused: boolean }> {
  const clean = await treeClean(root, run)
  if (!clean && !force) return { applied: [], refused: true }
  const { applied } = applyEdits(root, edits)
  return { applied, refused: false }
}
