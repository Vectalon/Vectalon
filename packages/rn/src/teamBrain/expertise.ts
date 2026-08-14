/**
 * vectalon team brain — Team Expertise Mapping (Roadmap 046)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Who owns what: derived from git history (author → commits → files → owned
 * components/screens). Deterministic and hermetic-testable — callers may inject
 * `git log` output; when absent the real git log is run and failures degrade
 * gracefully to an empty map (non-git directories never crash the pass).
 */

import { runCommand } from '../adapters/runCommand'
import type { ExpertiseEntry } from './types'

const EXTENDED_LINE = /^([0-9a-f]{7,40})\|([^|]*)\|([^|]*)\|(.*)$/
const HASH_LINE = /^[0-9a-f]{7,40}$/

/** Default cap on `git log` rows walked. */
const LOG_LIMIT = 200

export interface ParsedCommit {
  hash: string
  author: string
  date?: string
}

/**
 * Parse `git log --pretty=format:%h|%an|%ai|%s` output into author→commit rows.
 */
export function parseGitAuthors(logOutput: string): ParsedCommit[] {
  const out: ParsedCommit[] = []
  for (const line of logOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(EXTENDED_LINE)
    if (!m) continue
    const author = (m[2] || '').trim()
    if (!author) continue
    out.push({
      hash: m[1],
      author,
      date: m[3] ? m[3].slice(0, 10) : undefined,
    })
  }
  return out
}

/**
 * Parse `git log --name-only --pretty=format:%h` output into commit → files.
 * Each bare hash starts a new commit; following lines are the files it touched.
 */
export function parseGitFiles(logOutput: string): Map<string, string[]> {
  const byCommit = new Map<string, string[]>()
  let current: string | null = null
  for (const line of logOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (HASH_LINE.test(trimmed)) {
      current = trimmed
      if (!byCommit.has(current)) byCommit.set(current, [])
      continue
    }
    if (current) {
      const files = byCommit.get(current)!
      if (!files.includes(trimmed)) files.push(trimmed)
    }
  }
  return byCommit
}

/** Pull the owning component/screen out of a file path (PascalCase basename). */
export function componentFromPath(relPath: string): string | null {
  const base = relPath.split('/').pop() || ''
  const name = base.replace(/\.(tsx?|jsx?)$/, '')
  if (/^[A-Z][a-z0-9]*[A-Z]/.test(name)) return name
  return null
}

/** Aggregate author stats from parsed git data. */
export function aggregateExpertise(
  commits: ParsedCommit[],
  filesByCommit: Map<string, string[]>,
  maxComponents = 8
): ExpertiseEntry[] {
  const byAuthor = new Map<string, { commits: number; lastCommit?: string; files: Set<string>; components: Set<string> }>()
  const newestDate = (a?: string, b?: string): string | undefined =>
    a && b ? (a > b ? a : b) : a || b

  for (const commit of commits) {
    const entry = byAuthor.get(commit.author) || { commits: 0, lastCommit: undefined, files: new Set<string>(), components: new Set<string>() }
    entry.commits++
    entry.lastCommit = newestDate(entry.lastCommit, commit.date)
    for (const file of filesByCommit.get(commit.hash) || []) {
      entry.files.add(file)
      const component = componentFromPath(file)
      if (component) entry.components.add(component)
    }
    byAuthor.set(commit.author, entry)
  }

  return [...byAuthor.entries()]
    .map(([author, e]) => ({
      author,
      commits: e.commits,
      lastCommit: e.lastCommit,
      files: e.files.size,
      components: [...e.components].sort().slice(0, maxComponents),
    }))
    .sort((a, b) => b.commits - a.commits)
}

/** Run the real git log (best-effort — failures return empty inputs). */
async function runGitLog(root: string): Promise<{ commits: ParsedCommit[]; files: Map<string, string[]> }> {
  try {
    const [logResult, filesResult] = await Promise.all([
      runCommand('git', ['log', `--pretty=format:%h|%an|%ai|%s`, `-n ${LOG_LIMIT}`], { cwd: root }),
      runCommand('git', ['log', '--name-only', `--pretty=format:%h`, `-n ${LOG_LIMIT}`], { cwd: root }),
    ])
    return {
      commits: logResult.success ? parseGitAuthors(logResult.stdout) : [],
      files: filesResult.success ? parseGitFiles(filesResult.stdout) : new Map(),
    }
  } catch {
    return { commits: [], files: new Map() }
  }
}

/** Derive the team expertise map for a project root. */
export async function deriveExpertise(
  root: string,
  options: { gitLog?: string; gitFilesLog?: string } = {}
): Promise<ExpertiseEntry[]> {
  const commits = options.gitLog !== undefined ? parseGitAuthors(options.gitLog) : []
  let files: Map<string, string[]>
  if (options.gitFilesLog !== undefined) {
    files = parseGitFiles(options.gitFilesLog)
  } else if (options.gitLog !== undefined) {
    // Injecting commits without a files log: still usable (files empty).
    files = new Map()
  } else {
    const real = await runGitLog(root)
    return aggregateExpertise(real.commits, real.files)
  }
  return aggregateExpertise(commits, files)
}

/** Render the expertise map as markdown (docs/vectalon/team/expertise.md). */
export function renderExpertise(entries: ExpertiseEntry[], projectName: string): string {
  const lines = [`# Team Expertise Map — ${projectName}`, '']
  if (entries.length === 0) {
    lines.push('No git history available — expertise mapping needs commits (a git repo with at least one commit).')
    return lines.join('\n')
  }
  lines.push('Derived from git history: commit counts, file ownership, and the components/screens each author touches.', '')
  lines.push('| Author | Commits | Last commit | Files | Owned components |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const e of entries) {
    lines.push(`| ${e.author} | ${e.commits} | ${e.lastCommit || '—'} | ${e.files} | ${e.components.join(', ') || '—'} |`)
  }
  return lines.join('\n')
}
