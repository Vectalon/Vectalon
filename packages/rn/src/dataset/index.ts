/**
 * vectalon dataset — Fine-tuning Dataset Agent (Roadmap Phase 10, item 088)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over a training-data directory (default
 * `.vectalon/dataset/`): validate JSONL schema consistency, dedupe, label
 * balance, length outliers, and PII leakage. Reports to
 * docs/vectalon/dataset/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DatasetEntry, DatasetFinding, DatasetReport, DatasetStat } from './types'

export type { DatasetEntry, DatasetFinding, DatasetReport, DatasetStat } from './types'

/** Where dataset reports are written. */
export const datasetDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'dataset')

/** Default dataset locations, in priority order. */
export const DATASET_DIRS = ['.vectalon/dataset', 'dataset', 'training-data']

/** Parse one JSONL line into a dataset entry. */
export function parseDatasetLine(line: string, lineNo: number): DatasetEntry | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const messages = Array.isArray(raw.messages) ? raw.messages as Array<{ role?: string; content?: unknown }> : undefined
    const instruction = typeof raw.instruction === 'string' ? raw.instruction : typeof raw.prompt === 'string' ? raw.prompt : undefined
    const output = typeof raw.output === 'string' ? raw.output : typeof raw.response === 'string' ? raw.response : typeof raw.completion === 'string' ? raw.completion : undefined
    const text = messages
      ? messages.map(m => (typeof m?.content === 'string' ? m.content : '')).join(' ')
      : [instruction, output].filter(Boolean).join(' ')
    return {
      id: typeof raw.id === 'string' ? raw.id : typeof raw.id === 'number' ? String(raw.id) : undefined,
      line: lineNo,
      format: messages ? 'chat' : instruction !== undefined ? 'instruction' : 'unknown',
      messages,
      instruction,
      output,
      text: text.trim(),
      meta: raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta as Record<string, unknown> : undefined,
      label: typeof raw.label === 'string' ? raw.label : undefined,
    }
  } catch {
    return null
  }
}

/** PII heuristics: emails, phone numbers, API keys, addresses-ish. */
const PII_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { kind: 'phone', re: /(?:\+?\d{1,3}[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/ },
  { kind: 'api-key', re: /(sk|pk)_(live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}/ },
  { kind: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/ },
]

/** Scan a string for PII kinds. */
export function findPii(text: string): string[] {
  const found = new Set<string>()
  for (const { kind, re } of PII_PATTERNS) {
    if (re.test(text)) found.add(kind)
  }
  return [...found]
}

/** Run the dataset pass. */
export function runDatasetScan(root: string, dirOverride?: string): DatasetReport {
  const scannedAt = Date.now()
  const findings: DatasetFinding[] = []
  const entries: DatasetEntry[] = []
  let filesScanned = 0
  let fileCount = 0

  let dir: string | null = null
  for (const candidate of dirOverride ? [dirOverride] : DATASET_DIRS) {
    if (existsSync(join(root, candidate))) {
      dir = join(root, candidate)
      break
    }
  }

  if (!dir) {
    findings.push({
      id: 'no-dataset', severity: 'info',
      message: 'No dataset directory found (.vectalon/dataset, dataset, or training-data).',
      suggestion: 'Export training examples as JSONL into one of those directories so this agent can validate the dataset.',
    })
    const emptyStats: DatasetStat = { entries: 0, files: 0, formats: {}, medianLength: 0, maxLength: 0, duplicates: 0, labels: {} }
    return { scannedAt, root, filesScanned: 0, entries: [], stats: emptyStats, findings, verdict: 'approved', summary: { total: 1, bySeverity: { info: 1 } } }
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()
  fileCount = files.length
  for (const file of files) {
    const path = join(dir, file)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (stat.size === 0) continue
    let content = ''
    try {
      content = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    filesScanned++
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
    for (let i = 0; i < lines.length; i++) {
      const entry = parseDatasetLine(lines[i], i + 1)
      if (!entry) {
        findings.push({
          id: 'malformed', severity: 'warning', line: i + 1,
          message: `Malformed JSONL line in ${file} (line ${i + 1})`,
          suggestion: 'Fix or remove the malformed line so the dataset stays parseable.',
        })
        continue
      }
      if (entry.text.length === 0) {
        findings.push({
          id: 'empty', severity: 'warning', line: i + 1,
          message: `Empty example in ${file} (line ${i + 1})`,
          suggestion: 'Remove empty examples — they add noise to training.',
        })
      }
      for (const kind of findPii(entry.text)) {
        findings.push({
          id: 'pii', severity: 'warning', line: i + 1,
          message: `Possible ${kind} in ${file} (line ${i + 1})`,
          suggestion: 'Redact or synthesize the PII before training — leaked data is unrecoverable in the weights.',
        })
      }
      entries.push(entry)
    }
  }

  // Schema consistency.
  const formats = new Set(entries.map(e => e.format))
  if (formats.size > 1) {
    findings.push({
      id: 'mixed-schema', severity: 'warning',
      message: `Mixed example schemas across the dataset: ${[...formats].join(', ')}`,
      suggestion: 'Use one schema (chat messages or instruction/response) — mixed schemas degrade SFT quality.',
    })
  }

  // Duplicates.
  const byText = new Map<string, number[]>()
  entries.forEach((e, i) => {
    if (e.text.length === 0) return
    byText.set(e.text, [...(byText.get(e.text) ?? []), i + 1])
  })
  const dupCount = [...byText.values()].filter(lines => lines.length > 1).reduce((sum, lines) => sum + lines.length - 1, 0)
  if (dupCount > 0) {
    findings.push({
      id: 'duplicates', severity: 'warning',
      message: `${dupCount} duplicate example(s) (exact-text collisions)`,
      suggestion: 'Deduplicate before training — repeated examples over-weight those behaviors.',
    })
  }

  // Length outliers.
  const lengths = entries.map(e => e.text.length)
  const sorted = [...lengths].sort((a, b) => a - b)
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0
  const outliers = entries.filter(e => e.text.length > median * 10 && e.text.length > 2000)
  if (outliers.length > 0) {
    findings.push({
      id: 'length-outliers', severity: 'info',
      message: `${outliers.length} example(s) exceed 10× the median length (median ${median} chars, max ${max} chars)`,
      suggestion: 'Trim or split very long examples — they inflate context and dilute signal.',
    })
  }

  // Label balance (classification datasets).
  const byLabel = new Map<string, number>()
  for (const e of entries) if (e.label) byLabel.set(e.label, (byLabel.get(e.label) ?? 0) + 1)
  if (byLabel.size > 0) {
    const counts = [...byLabel.values()]
    const maxL = Math.max(...counts)
    const minL = Math.min(...counts)
    if (counts.length > 1 && maxL / minL > 3) {
      findings.push({
        id: 'label-imbalance', severity: 'warning',
        message: `Label imbalance: ${[...byLabel.entries()].map(([l, c]) => `${l}=${c}`).join(', ')}`,
        suggestion: 'Balance classes (undersample the majority / oversample the minority) to avoid bias.',
      })
    }
  }

  const stats: DatasetStat = {
    entries: entries.length,
    files: fileCount,
    formats: Object.fromEntries([...formats].map(f => [f, entries.filter(e => e.format === f).length])),
    medianLength: median,
    maxLength: max,
    duplicates: dupCount,
    labels: Object.fromEntries(byLabel),
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: DatasetReport['verdict'] = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, filesScanned, entries, stats, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the dataset report as markdown. */
export function renderDatasetMarkdown(report: DatasetReport): string {
  const lines = ['# vectalon dataset — Fine-tuning Dataset', '']
  lines.push(`Files: ${report.stats.files}  ·  Examples: ${report.stats.entries}  ·  Verdict: **${report.verdict}**`, '')
  if (report.stats.entries > 0) {
    lines.push('', '## Stats', '', `- Formats: ${JSON.stringify(report.stats.formats)}`, `- Median length: ${report.stats.medianLength} chars`, `- Max length: ${report.stats.maxLength} chars`, `- Duplicates: ${report.stats.duplicates}`, `- Labels: ${JSON.stringify(report.stats.labels)}`, '')
  }
  if (report.findings.length === 0) lines.push('', 'No dataset issues found.', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    const where = f.line !== undefined ? ` (line ${f.line})` : ''
    lines.push(`### [${mark}] ${f.id}${where}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeDatasetReport(root: string, report: DatasetReport): { mdPath: string; jsonPath: string } {
  const dir = datasetDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderDatasetMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
