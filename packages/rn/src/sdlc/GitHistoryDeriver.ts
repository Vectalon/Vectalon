import { parseGitLog, detectBumpType, bumpVersion, type BumpType } from './ReleasePlanner'
import { ReleaseNoteWriter, categorizeChange, SECTION_ORDER, SECTION_TITLES, type ReleaseNoteCategory } from './ReleaseNoteWriter'
import { ADRWriter } from './ADRWriter'

/**
 * Git-history artifact derivation — Phase K / III-2: "knowledge that writes
 * itself."
 *
 * Walks `git log` output and derives changelog entries, release notes, and ADR
 * drafts deterministically (no model calls). Accepts both `--oneline` output
 * (reusing `parseGitLog`) and an extended format (`%h|%an|%ai|%s`) so authors
 * and dates land in the derived artifacts.
 */

export type DerivationCategory = ReleaseNoteCategory

/** A single commit as parsed from `git log`, before classification. */
export interface RawCommit {
  hash: string
  message: string
  author?: string
  date?: string
}

export interface DerivedCommit extends RawCommit {
  category: DerivationCategory
  breaking: boolean
}

export interface DerivedAdr {
  title: string
  content: string
  commitHash: string
  commitMessage: string
}

export interface GitDerivationOptions {
  /** Current semver — when provided the derivation also computes nextVersion + bump. */
  currentVersion?: string
  /** Cap on derived ADR drafts (0 disables). Default 10. */
  maxAdrs?: number
}

export interface GitDerivationStats {
  total: number
  authors: string[]
  breaking: number
  categories: Record<DerivationCategory, number>
  dateRange: { from: string; to: string } | null
}

export interface GitDerivation {
  commits: DerivedCommit[]
  changelog: string
  releaseNotes: string
  adrs: DerivedAdr[]
  stats: GitDerivationStats
  currentVersion?: string
  nextVersion?: string
  bump?: BumpType
}

const EXTENDED_LINE = /^([0-9a-f]{7,40})\|([^|]*)\|([^|]*)\|(.*)$/

const BREAKING_MARKERS = [
  'breaking change',
  'breaking-change',
  'feat!',
  'fix!',
  'chore!',
  'refactor!',
  'perf!',
  'build!',
  'revert!',
]

/** Commits that look like architectural decisions get derived into ADR drafts. */
const ADR_KEYWORDS = [
  'architect',
  'redesign',
  'migrat',
  'replace',
  'adopt',
  'rewrite',
  'decision',
  'deprecat',
  'upgrade to',
  'move to',
  'move from',
  'switch to',
  'strategy',
]

/**
 * Parse `git log` output into raw commits. Detects the extended
 * `%h|%an|%ai|%s` format per line, and falls back to `--oneline` parsing for
 * the rest.
 */
export function parseCommitHistory(logOutput: string): RawCommit[] {
  const out: RawCommit[] = []
  for (const line of logOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const extended = trimmed.match(EXTENDED_LINE)
    if (extended) {
      const message = extended[4].trim()
      if (!message) continue
      out.push({
        hash: extended[1],
        author: extended[2] || undefined,
        date: extended[3] ? extended[3].slice(0, 10) : undefined,
        message,
      })
      continue
    }
    const parsed = parseGitLog(trimmed)
    if (parsed.length > 0) {
      const commit = parsed[0]
      out.push({ hash: commit.hash, message: commit.message })
    }
  }
  return out
}

/** Whether a commit message signals a breaking change. */
export function isBreaking(message: string): boolean {
  const lower = message.toLowerCase()
  return BREAKING_MARKERS.some(marker => lower.includes(marker)) || /\bBREAKING CHANGE\b/.test(message)
}

/** Strip a conventional-commit prefix (`feat:`, `fix(scope):`, `feat!:`) for titles. */
export function stripCommitPrefix(message: string): string {
  return message.replace(/^[a-z]+(\([^)]*\))?!?:/, '').trim()
}

/**
 * Derive changelog entries, release notes, and ADR drafts from git history.
 * Deterministic — no model calls — so tests stay hermetic.
 */
export function deriveFromGitHistory(logOutput: string, options: GitDerivationOptions = {}): GitDerivation {
  const raw = parseCommitHistory(logOutput)
  const commits: DerivedCommit[] = raw.map(commit => ({
    ...commit,
    category: categorizeChange(commit.message),
    breaking: isBreaking(commit.message),
  }))

  // Changelog grouped by category, newest commits first (git log order).
  const grouped = new Map<DerivationCategory, DerivedCommit[]>()
  for (const commit of commits) {
    grouped.set(commit.category, [...(grouped.get(commit.category) || []), commit])
  }
  const changelogLines = ['# Changelog', '']
  for (const category of SECTION_ORDER) {
    const items = grouped.get(category)
    if (!items || items.length === 0) continue
    changelogLines.push(`## ${SECTION_TITLES[category]}`, '')
    for (const commit of items) {
      const ref = commit.hash ? `[\`${commit.hash.slice(0, 7)}\`] ` : ''
      const badge = commit.breaking ? ' ⚠️ **BREAKING**' : ''
      changelogLines.push(`- ${ref}${commit.message}${badge}`)
    }
    changelogLines.push('')
  }

  // Version bump when a current version is supplied.
  const currentVersion = options.currentVersion
  const bump = currentVersion
    ? detectBumpType(commits.map(c => ({ hash: c.hash, message: c.message, lower: c.message.toLowerCase() })))
    : undefined
  const nextVersion = currentVersion && bump ? bumpVersion(currentVersion, bump) : undefined

  const releaseNotes = new ReleaseNoteWriter().writeReleaseNotes({
    version: nextVersion || 'unreleased',
    changes: commits.map(c => c.message),
  })

  // ADR drafts from decision-worthy commits.
  const maxAdrs = options.maxAdrs ?? 10
  const adrs: DerivedAdr[] = []
  if (maxAdrs > 0) {
    for (const commit of commits) {
      if (adrs.length >= maxAdrs) break
      const lower = commit.message.toLowerCase()
      if (!ADR_KEYWORDS.some(keyword => lower.includes(keyword))) continue
      const title = stripCommitPrefix(commit.message).slice(0, 72) || commit.message.slice(0, 72)
      const content = new ADRWriter().writeADR({
        title,
        context: `Derived automatically from commit \`${commit.hash || 'n/a'}\`.\n\n> ${commit.message}\n\nReview and refine this draft before accepting it.`,
        decision: commit.message,
        status: 'proposed',
        number: adrs.length + 1,
      })
      adrs.push({ title, content, commitHash: commit.hash, commitMessage: commit.message })
    }
  }

  const authors = [...new Set(commits.map(c => c.author).filter((a): a is string => Boolean(a)))]
  const dates = commits.map(c => c.date).filter((d): d is string => Boolean(d)).sort()
  const categories = Object.fromEntries(SECTION_ORDER.map(c => [c, grouped.get(c)?.length || 0])) as Record<DerivationCategory, number>

  return {
    commits,
    changelog: changelogLines.join('\n').trim(),
    releaseNotes,
    adrs,
    stats: {
      total: commits.length,
      authors,
      breaking: commits.filter(c => c.breaking).length,
      categories,
      dateRange: dates.length >= 2
        ? { from: dates[0], to: dates[dates.length - 1] }
        : dates.length === 1
          ? { from: dates[0], to: dates[0] }
          : null,
    },
    currentVersion,
    nextVersion,
    bump,
  }
}

/** Render a combined markdown report for a git-history derivation. */
export function renderGitDerivation(derivation: GitDerivation): string {
  const lines = ['## 📜 Derived from git history', '']
  lines.push(`**Commits analyzed:** ${derivation.stats.total}${derivation.stats.breaking ? ` · ⚠️ **${derivation.stats.breaking} breaking**` : ''}`)
  if (derivation.stats.authors.length > 0) lines.push(`**Authors:** ${derivation.stats.authors.join(', ')}`)
  if (derivation.stats.dateRange) lines.push(`**Range:** ${derivation.stats.dateRange.from} → ${derivation.stats.dateRange.to}`)
  if (derivation.currentVersion && derivation.nextVersion && derivation.bump) {
    lines.push(`**Version:** ${derivation.currentVersion} → ${derivation.nextVersion} (${derivation.bump} bump)`)
  }
  lines.push('', '---', '', derivation.changelog, '', '---', '', derivation.releaseNotes)
  if (derivation.adrs.length > 0) {
    lines.push('', '---', '', `## Derived ADR drafts (${derivation.adrs.length})`, '')
    for (const adr of derivation.adrs) {
      lines.push(`- **${adr.title}** — \`${adr.commitHash || 'n/a'}\` \`${adr.commitMessage}\``)
    }
    lines.push('', 'Each ADR is persisted as an `architecture` artifact — review and refine before accepting.')
  }
  return lines.join('\n')
}
