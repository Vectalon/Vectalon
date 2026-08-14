/**
 * vectalon team brain — PR Knowledge Extraction (Roadmap 045)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Pulls merge/squash PR references out of git history so the team brain knows
 * what shipped and why. Deterministic — parses the same extended git log format
 * the expertise map uses, so a single injected log feeds both (hermetic tests).
 */

import type { PrKnowledgeEntry } from './types'
import { parseGitAuthors, type ParsedCommit } from './expertise'

interface ParsedPrCommit extends ParsedCommit {
  message: string
}

/** Extended-format commit rows, kept only when they reference a PR. */
export function parsePrCommits(logOutput: string): ParsedPrCommit[] {
  const out: ParsedPrCommit[] = []
  const EXTENDED_LINE = /^([0-9a-f]{7,40})\|([^|]*)\|([^|]*)\|(.*)$/
  for (const line of logOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(EXTENDED_LINE)
    if (!m) continue
    const message = (m[4] || '').trim()
    if (!message) continue
    const author = (m[2] || '').trim()
    if (!author) continue
    out.push({ hash: m[1], author, date: m[3] ? m[3].slice(0, 10) : undefined, message })
  }
  return out
}

const MERGE_PR_RE = /^Merge pull request #(\d+) from (\S+)\s*(?:[-—]\s*(.*))?$/i
const SQUASH_PR_RE = /^(.*?)\s*\(#(\d+)\)\s*$/
const CONVENTIONAL_PREFIX = /^[a-z]+(\[[^\]]*\])?(\s*\([^)]*\))?!?:\s*/i

function stripPrefix(message: string): string {
  return message.replace(CONVENTIONAL_PREFIX, '').trim()
}

/**
 * Extract PR knowledge entries from git log output, newest first (git log
 * order). Supports both merge commits ("Merge pull request #12 …") and
 * squash-merged conventional commits ("feat(x): … (#12)").
 */
export function derivePrKnowledge(logOutput: string, maxPrs = 15): PrKnowledgeEntry[] {
  const entries: PrKnowledgeEntry[] = []
  for (const commit of parsePrCommits(logOutput)) {
    if (entries.length >= maxPrs) break
    const merge = commit.message.match(MERGE_PR_RE)
    if (merge) {
      // GitHub merge commits usually carry no description — the source branch
      // name is the closest proxy for the PR subject.
      const title = (merge[3] || merge[2] || stripPrefix(commit.message) || 'Merge').trim().slice(0, 100)
      entries.push({
        pr: merge[1],
        title,
        hash: commit.hash,
        author: commit.author,
        date: commit.date,
      })
      continue
    }
    const squash = commit.message.match(SQUASH_PR_RE)
    if (squash && squash[2]) {
      const title = stripPrefix(squash[1].trim())
      if (!title) continue
      entries.push({
        pr: squash[2],
        title: title.slice(0, 100),
        hash: commit.hash,
        author: commit.author,
        date: commit.date,
      })
    }
  }
  return entries
}

/** Render PR knowledge as markdown (docs/vectalon/team/pr-knowledge.md). */
export function renderPrKnowledge(entries: PrKnowledgeEntry[], projectName: string): string {
  const lines = [`# PR Knowledge — ${projectName}`, '']
  if (entries.length === 0) {
    lines.push('No PR/merge references found in git history (looks for "Merge pull request #N" and squash-merged "(#N)" commits).')
    return lines.join('\n')
  }
  lines.push('What recently shipped, extracted from git history.', '')
  for (const entry of entries) {
    const meta = [entry.pr, entry.author, entry.date].filter(Boolean).join(' · ')
    lines.push(`- **PR #${entry.pr}** — ${entry.title}${entry.hash ? ` (\`${entry.hash.slice(0, 7)}\`)` : ''}`)
    lines.push(`  - ${meta}`)
  }
  return lines.join('\n')
}

/** Re-export so index.ts needs only one import site for git parsing. */
export type { ParsedCommit }
export { parseGitAuthors }
