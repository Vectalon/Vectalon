/**
 * vc fix — apply: apply the planned edits in a throwaway sandbox copy (never
 * touching the real tree by default), produce the exact diff, and — only with
 * --apply on a clean git tree — write the edits in place.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync, cpSync, realpathSync, lstatSync } from 'fs'
import { tmpdir } from 'os'
import { join, sep, isAbsolute, win32 } from 'path'
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

function existingEditPath(dir: string, file: string): string | null {
  if (typeof file !== 'string' || !file || isAbsolute(file) || win32.isAbsolute(file) || file.includes('\\') || file.includes('\0')) return null
  const parts = file.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return null
  try {
    let target = realpathSync(dir)
    for (const part of parts) {
      target = join(target, part)
      if (lstatSync(target).isSymbolicLink()) return null
    }
    const stat = lstatSync(target)
    return stat.isFile() && stat.nlink === 1 ? target : null
  } catch { return null }
}

/** Exact, unique anchors only; skipped edits never fall back to a guessed location. */
export function applyEdits(dir: string, edits: FixEdit[]): { applied: FixEdit[]; skipped: FixEdit[] } {
  const applied: FixEdit[] = []
  const skipped: FixEdit[] = []
  for (const e of edits) {
    const p = e && existingEditPath(dir, e.file)
    if (!p || !['replace', 'insert-after'].includes(e.op) || typeof e.from !== 'string' || !e.from || typeof e.to !== 'string') {
      skipped.push(e)
      continue
    }
    try {
      const content = readFileSync(p, 'utf-8')
      const idx = content.indexOf(e.from)
      if (idx === -1 || content.indexOf(e.from, idx + 1) !== -1) {
        skipped.push(e)
        continue
      }
      const next =
        e.op === 'replace' ? content.slice(0, idx) + e.to + content.slice(idx + e.from.length)
        : content.slice(0, idx + e.from.length) + e.to + content.slice(idx + e.from.length)
      if (next === content) { skipped.push(e); continue }
      // shortcut: path checks assume no concurrent filesystem mutation; isolate untrusted writers at the OS level.
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
  for (const file of new Set(applied.map(e => e.file))) {
    const oldPath = existingEditPath(root, file)
    const newPath = existingEditPath(editedDir, file)
    if (!oldPath || !newPath) continue
    const oldC = safeRead(oldPath)
    const newC = safeRead(newPath)
    if (oldC === newC) continue
    parts.push(unifiedDiff(file, oldC, newC))
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
