/**
 * vectalon team brain — ADR Indexing + Decision Tracking (Roadmap 042, 048)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Discovers architecture decision records and decision logs already in the
 * repo (docs/adr/, docs/decisions/, adr/, decisions/, *.adr.md, DECISIONS.md)
 * and indexes them so the team brain can surface them and search over them.
 * The files themselves are the source of truth — nothing is written back.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import type { DecisionIndexEntry } from './types'

const DECISION_DIRS = ['docs/adr', 'docs/decisions', 'adr', 'decisions', 'docs/architecture/decisions']

/** Filenames that look like decision records, case-insensitively. */
function isDecisionFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower === 'decisions.md' || lower === 'adrs.md') return true
  if (lower.endsWith('.adr.md')) return true
  if (/^adr-?\d/.test(lower)) return true
  if (/^decision/.test(lower)) return true
  // Classic ADR numbering: 0001-title.md (safe inside decision dirs, where
  // this matcher does most of its work; rare false positive at root).
  if (/^\d{2,}[-_]/.test(lower)) return true
  return false
}

/** Walk a directory recursively, returning file paths relative to `root`. */
function walkDir(root: string, dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const full = join(dir, entry)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkDir(root, full, out)
    } else if (isDecisionFile(entry)) {
      out.push(relative(root, full))
    }
  }
  return out
}

/** Collect decision/ADR file paths under a project root. */
export function findDecisionFiles(root: string): string[] {
  const found = new Set<string>()
  for (const dir of DECISION_DIRS) {
    const full = join(root, dir)
    if (existsSync(full) && statSync(full).isDirectory()) {
      for (const rel of walkDir(root, full)) found.add(rel)
    }
  }
  // Root-level decision files (DECISIONS.md, ADRS.md, *.adr.md).
  try {
    for (const entry of readdirSync(root)) {
      if (isDecisionFile(entry)) found.add(entry)
    }
  } catch {
    // root unreadable — nothing to add
  }
  return [...found].sort()
}

/** First `# ` heading, else the first non-empty line, else the filename. */
export function titleFromContent(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  const firstLine = content.split('\n').find(l => l.trim().length > 0)
  return (firstLine || fallback).trim().slice(0, 120)
}

/** Status from a `## Status` section or `status:` line, else undefined. */
export function statusFromContent(content: string): string | undefined {
  const statusSection = content.match(/^##\s+Status\s*$/m)
  if (statusSection) {
    const after = content.slice(statusSection.index! + statusSection[0].length).split('\n').find(l => l.trim().length > 0)
    if (after) return after.trim().slice(0, 40)
  }
  const inline = content.match(/^status\s*:\s*(.+)$/im)
  return inline ? inline[1].trim().slice(0, 40) : undefined
}

/** Stable id: ADR number when the file names one, else a path slug. */
export function decisionId(path: string): string {
  const base = path.split('/').pop() || path
  const number = base.match(/(\d{2,})/) || path.match(/ADR-?(\d+)/i)
  if (number) return `adr-${number[1]}`
  return `decision-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/** Index every decision/ADR file in the project. */
export function indexDecisionFiles(root: string, limit = 50): DecisionIndexEntry[] {
  const entries: DecisionIndexEntry[] = []
  for (const rel of findDecisionFiles(root)) {
    if (entries.length >= limit) break
    let content: string
    try {
      content = readFileSync(join(root, rel), 'utf-8')
    } catch {
      continue
    }
    entries.push({
      id: decisionId(rel),
      title: titleFromContent(content, rel),
      status: statusFromContent(content),
      path: rel,
    })
  }
  return entries
}

/** Render the decision index as markdown (docs/vectalon/team/decisions.md). */
export function renderDecisions(entries: DecisionIndexEntry[], projectName: string): string {
  const lines = [`# Architecture Decision Index — ${projectName}`, '']
  if (entries.length === 0) {
    lines.push('No ADR/decision files found. Record decisions in docs/adr/ (or adr/, decisions/, *.adr.md, DECISIONS.md) and they will appear here automatically.')
    return lines.join('\n')
  }
  lines.push('Indexed from decision records already in the repo — the files remain the source of truth.', '')
  for (const entry of entries) {
    lines.push(`- **${entry.title}** (\`${entry.id}\`)${entry.status ? ` — ${entry.status}` : ''}`)
    lines.push(`  - \`${entry.path}\``)
  }
  return lines.join('\n')
}
