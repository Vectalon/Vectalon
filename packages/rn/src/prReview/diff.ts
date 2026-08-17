/**
 * vectalon pr — unified diff parser.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses the unified diff format (what `git diff`, `gh pr diff`, and the
 * GitHub .diff URL all emit) into per-file changes with the added lines and
 * their new-file line numbers — the attribution surface for the checks: a
 * finding only counts when it sits on a line the PR actually added.
 */
import type { PrChangedFile } from './types'

const FILE_RE = /^diff --git a\/(.*) b\/(.*)$/
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parse a unified diff. Handles multiple files, multiple hunks per file,
 * and `\ No newline at end of file` markers. Returns an empty array for a
 * non-diff (or empty) input.
 */
export function parseUnifiedDiff(diff: string): PrChangedFile[] {
  const files: PrChangedFile[] = []
  let current: PrChangedFile | null = null
  let newLine = 0

  const lines = diff.split('\n')
  for (const raw of lines) {
    // A new file section.
    const fileMatch = raw.match(FILE_RE)
    if (fileMatch) {
      const path = fileMatch[2].trim()
      if (current) files.push(current)
      current = { path, additions: 0, deletions: 0, addedLines: [] }
      newLine = 0
      continue
    }
    // Index/---/+++ lines and blank lines — skip.
    if (/^index |^--- |^\+\+\+ /.test(raw)) continue
    if (raw === '\\ No newline at end of file') continue

    const hunk = raw.match(HUNK_RE)
    if (hunk) {
      if (!current) {
        // A diff without the `diff --git` header — still parseable.
        current = { path: 'unknown', additions: 0, deletions: 0, addedLines: [] }
      }
      newLine = Number(hunk[3])
      continue
    }

    if (!current) continue
    if (raw.startsWith('+')) {
      current.additions++
      current.addedLines.push({ line: newLine, text: raw.slice(1) })
      newLine++
    } else if (raw.startsWith('-')) {
      current.deletions++
    } else if (raw.startsWith(' ')) {
      newLine++
    }
    // Anything else (e.g. binary markers) — ignored.
  }
  if (current) files.push(current)

  // Dedupe repeated `diff --git` sections for the same path (rename pairs
  // emit two headers) — keep the one with added lines.
  const byPath = new Map<string, PrChangedFile>()
  for (const f of files) {
    const prev = byPath.get(f.path)
    if (!prev || (f.additions > 0 && prev.additions === 0)) byPath.set(f.path, f)
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** Convenience: the set of added line numbers for one file. */
export function addedLineSet(file: PrChangedFile): Set<number> {
  return new Set(file.addedLines.map(l => l.line))
}
