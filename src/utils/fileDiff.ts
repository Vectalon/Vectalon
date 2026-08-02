import pc from 'picocolors'

export interface DiffLine {
  kind: 'context' | 'add' | 'remove'
  text: string
}

export type FileChangeAction = 'created' | 'modified' | 'deleted'

export interface FileChange {
  /** Display path, relative to the project root when known. */
  path: string
  action: FileChangeAction
  additions: number
  deletions: number
  /** Raw diff lines (excluding the header); formatFileChange colorizes them. */
  diff: DiffLine[]
}

/** Writer installed by the CLI; default is a no-op so library callers stay quiet. */
export type FileChangeWriter = (change: FileChange) => void

let writer: FileChangeWriter | null = null

export function setFileChangeWriter(next: FileChangeWriter | null): void {
  writer = next
}

export function reportFileChange(change: FileChange): void {
  if (!writer) return
  try {
    writer(change)
  } catch {
    // Never let logging break the write path
  }
}

/**
 * Longest-common-subsequence line diff. Simple and dependency-free; the matrix
 * is capped so pathological inputs fall back to a full replace instead of
 * exhausting memory.
 */
function splitLines(content: string): string[] {
  const lines = content.split('\n')
  // A trailing newline produces a spurious empty entry; drop it so the diff
  // never shows a stray +/− for a final newline.
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function diffLines(oldContent: string, newContent: string): DiffLine[] {
  const a = splitLines(oldContent)
  const b = splitLines(newContent)

  const n = a.length
  const m = b.length
  const MAX_CELLS = 2_000_000
  if (n * m > MAX_CELLS) {
    const out: DiffLine[] = []
    for (const line of a) out.push({ kind: 'remove', text: line })
    for (const line of b) out.push({ kind: 'add', text: line })
    return out
  }

  // dp[i][j] = length of LCS of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: 'context', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: 'remove', text: a[i] })
      i++
    } else {
      result.push({ kind: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) result.push({ kind: 'remove', text: a[i++] })
  while (j < m) result.push({ kind: 'add', text: b[j++] })
  return result
}

const MAX_DIFF_LINES = 120

/**
 * Claude-style file change: an icon + action header line, then the colorized
 * diff (green additions, red deletions, dim context).
 */
export function formatFileChange(change: FileChange): string {
  const actionText = change.action === 'created' ? 'Created' : change.action === 'modified' ? 'Modified' : 'Deleted'
  const icon = change.action === 'created' ? pc.green('📝') : change.action === 'modified' ? pc.yellow('✏️') : pc.red('🗑️')
  const stats =
    change.action === 'created'
      ? pc.green(`+${change.additions}`)
      : change.action === 'deleted'
        ? pc.red(`-${change.deletions}`)
        : `${pc.green(`+${change.additions}`)} ${pc.red(`-${change.deletions}`)}`
  const header = `${icon} ${pc.bold(actionText)} ${pc.dim(change.path)} ${pc.dim(`(${stats})`)}`

  if (change.diff.length === 0) {
    return header
  }

  const visible = change.diff.slice(0, MAX_DIFF_LINES)
  const body = visible
    .map(line => {
      if (line.kind === 'add') return pc.green(`  + ${line.text}`)
      if (line.kind === 'remove') return pc.red(`  - ${line.text}`)
      return pc.dim(`    ${line.text}`)
    })
    .join('\n')

  const truncated = change.diff.length > MAX_DIFF_LINES ? `\n${pc.dim(`  … ${change.diff.length - MAX_DIFF_LINES} more lines`)}` : ''

  return `${header}\n${body}${truncated}`
}

/** Build a FileChange from old/new content, computing additions/deletions/diff. */
export function computeFileChange(path: string, action: FileChangeAction, oldContent: string | null, newContent: string): FileChange {
  const diff = diffLines(oldContent ?? '', newContent)
  let additions = 0
  let deletions = 0
  for (const line of diff) {
    if (line.kind === 'add') additions++
    else if (line.kind === 'remove') deletions++
  }
  return {
    path,
    action,
    additions,
    deletions,
    diff,
  }
}

export function reportPathChange(path: string, oldContent: string | null, newContent: string): void {
  if (!writer) return
  const action: FileChangeAction = oldContent === null ? 'created' : 'modified'
  reportFileChange(computeFileChange(path, action, oldContent, newContent))
}
