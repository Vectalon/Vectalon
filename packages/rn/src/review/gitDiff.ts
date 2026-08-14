/**
 * vectalon review — git diff derivation + unified-diff parsing
 * Business Source License 1.1 (BSL-1.1)
 *
 * The PR Review Agent reviews the *diff*, not the whole tree: we derive
 * `git diff <base>...HEAD` (default: uncommitted working-tree changes) and
 * parse the unified diff into per-file added lines with their real new-file
 * line numbers. Callers may inject `git diff` output directly for hermetic
 * tests; real git failures degrade to an empty diff (non-git directories
 * never crash the pass).
 */

import { runCommand } from '../adapters/runCommand'

/** One added line, pinned to its real position in the new file. */
export interface AddedLine {
  line: number
  text: string
}

/** A changed file: its new-side path and every added line. */
export interface ParsedDiffFile {
  path: string
  addedLines: AddedLine[]
}

/**
 * Parse unified `git diff` output into per-file added lines. Only additions
 * (`+` lines) are kept — a review flags what the PR introduces. Renames
 * resolve to the new path; deletions and binary files yield no added lines.
 */
export function parseGitDiff(diff: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = []
  let current: ParsedDiffFile | null = null
  let newLine = 0

  for (const raw of diff.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('diff --git ')) {
      if (current && current.addedLines.length > 0) files.push(current)
      current = null
      continue
    }
    // New-side path. `+++ b/foo.tsx` for tracked files; `+++ /dev/null` for
    // deletions (skip — nothing added).
    if (line.startsWith('+++ b/')) {
      current = { path: line.slice('+++ b/'.length), addedLines: [] }
      continue
    }
    if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) {
      const path = line.slice('+++ '.length)
      current = { path: path.replace(/^a\//, ''), addedLines: [] }
      continue
    }
    if (!current) continue

    // Hunk header: `@@ -oldStart,oldCount +newStart,newCount @@ context`.
    if (line.startsWith('@@ ')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      newLine = m ? parseInt(m[1], 10) : 0
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines.push({ line: newLine, text: line.slice(1) })
      newLine += 1
    } else if (line.startsWith('-')) {
      // Removed line — no new-file position.
    } else if (line.startsWith(' ')) {
      // Context line — advances the new-file counter.
      newLine += 1
    }
    // `\ No newline at end of file` and metadata lines are skipped.
  }
  if (current && current.addedLines.length > 0) files.push(current)
  return files
}

/** Derive the diff to review. Injectable output keeps tests hermetic; real
 * git failures (non-git dirs, bad refs) degrade to an empty diff. */
export async function deriveGitDiff(
  root: string,
  options: { base?: string; gitDiffOutput?: string } = {}
): Promise<string> {
  if (options.gitDiffOutput !== undefined) return options.gitDiffOutput
  try {
    const args = options.base
      ? ['diff', `${options.base}...HEAD`, '--']
      : ['diff', 'HEAD', '--']
    const result = await runCommand('git', args, { cwd: root })
    return result.success ? result.stdout : ''
  } catch {
    return ''
  }
}
