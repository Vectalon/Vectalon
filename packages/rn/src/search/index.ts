/**
 * vectalon search — Semantic Code Search Agent (Roadmap Phase 11, item 096)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Lexical project search with line-pinned results, ranked by match density.
 * Skips node_modules / build output; term matches score per file, and the
 * top lines are returned. Sub-second on mid-size repos. Reports to
 * docs/vectalon/search/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { collectSourceFiles } from '../intel/dependencyGraph'
import type { SearchHit, SearchReport, SearchVerdict } from './types'

export type { SearchHit, SearchReport, SearchVerdict } from './types'

/** Where search reports are written. */
export const searchDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'search')

const MAX_FILE_BYTES = 256 * 1024

/** Search source files for a query, returning ranked line-pinned hits. */
export function runSearch(root: string, query: string, limit = 20): Omit<SearchReport, 'scannedAt' | 'root'> {
  const started = Date.now()
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0)
  const files = collectSourceFiles(root)
  const scored: Array<{ file: string; score: number; lines: Array<{ line: number; text: string }> }> = []

  for (const file of files) {
    let path: string
    try {
      path = join(root, file)
      if (statSync(path).size > MAX_FILE_BYTES) continue
      const content = readFileSync(path, 'utf-8')
      const lines = content.split('\n')
      const hits: Array<{ line: number; text: string }> = []
      let score = 0
      for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase()
        let matched = 0
        for (const t of terms) if (lower.includes(t)) matched++
        if (matched > 0) {
          hits.push({ line: i + 1, text: lines[i].trim().slice(0, 140) })
          score += matched * 2
        }
      }
      if (hits.length > 0) {
        // Density bonus — a file that is mostly about the topic ranks above
        // one with a single passing mention.
        score += Math.min(10, hits.length)
        scored.push({ file, score, lines: hits })
      }
    } catch {
      continue
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const hits: SearchHit[] = []
  for (const s of scored.slice(0, limit)) {
    for (const l of s.lines.slice(0, 3)) hits.push({ file: s.file, line: l.line, text: l.text, score: s.score })
  }

  const findings: SearchReport['findings'] = []
  if (hits.length === 0) {
    findings.push({
      id: 'no-results',
      severity: 'info',
      message: `No matches for "${query}" across ${files.length} source files.`,
      suggestion: 'Broaden the query, check spelling, or search a different directory.',
    })
  }

  const verdict: SearchVerdict = hits.length > 0 ? 'approved' : 'needs-attention'
  return { query, filesScanned: files.length, hits, ms: Date.now() - started, findings, verdict }
}

/** Render the search results as markdown. */
export function renderSearchMarkdown(report: Omit<SearchReport, 'scannedAt' | 'root'>): string {
  const lines = [`# vectalon search — "${report.query}"`, '']
  lines.push(`Files scanned: ${report.filesScanned}  ·  Hits: ${report.hits.length}  ·  ${report.ms}ms`, '')
  let lastFile = ''
  for (const h of report.hits) {
    if (h.file !== lastFile) {
      lines.push(`## ${h.file}`, '')
      lastFile = h.file
    }
    lines.push(`- \`${h.line}\` ${h.text}`)
  }
  lines.push('', '## Findings', '')
  for (const f of report.findings) {
    lines.push(`### [INFO] ${f.id}`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeSearchReport(root: string, report: SearchReport): { mdPath: string; jsonPath: string } {
  const dir = searchDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderSearchMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}

/** Relative path helper for report output (kept for parity with other agents). */
export function relPath(root: string, file: string): string {
  return relative(root, file).replace(/\\/g, '/')
}
