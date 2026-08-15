/**
 * vectalon audit — Org-wide Audit Trail Agent (Roadmap Phase 10, item 084)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over the org audit trail (`.vectalon/audit/*.jsonl`):
 * validate the trail (required fields, sequence continuity, no secrets
 * logged), summarize activity by actor/action, and flag gaps. Reports to
 * docs/vectalon/audit/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { AuditEntry, AuditFinding, AuditReport, AuditSummary } from './types'

export type { AuditEntry, AuditFinding, AuditReport, AuditSummary } from './types'

/** Where audit reports are written. */
export const auditDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'audit')

/** Default audit trail locations, in priority order. */
export const AUDIT_DIRS = ['.vectalon/audit', 'audit']

/** Parse one JSONL line into an entry; null when malformed. */
export function parseAuditLine(line: string, lineNo: number): AuditEntry | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const seq = typeof raw.seq === 'number' ? raw.seq : typeof raw.sequence === 'number' ? raw.sequence : undefined
    const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : typeof raw.ts === 'number' ? raw.ts : undefined
    const actor = typeof raw.actor === 'string' ? raw.actor : typeof raw.user === 'string' ? raw.user : undefined
    const action = typeof raw.action === 'string' ? raw.action : undefined
    const target = typeof raw.target === 'string' ? raw.target : undefined
    if (action === undefined) return null
    return {
      seq,
      timestamp,
      actor,
      action,
      target,
      outcome: typeof raw.outcome === 'string' ? raw.outcome : undefined,
      details: raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details) ? raw.details as Record<string, unknown> : undefined,
      source: typeof raw.source === 'string' ? raw.source : undefined,
      line: lineNo,
    }
  } catch {
    return null
  }
}

/** Would this string look like a secret? */
export function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (/(sk|pk)_(live|test)_[A-Za-z0-9]{16,}/.test(value)) return true
  if (/AKIA[0-9A-Z]{16}/.test(value)) return true
  if (/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(value)) return true
  if (/ghp_[A-Za-z0-9]{20,}/.test(value)) return true
  return false
}

function deepSecretScan(value: unknown, path: string, findings: AuditFinding[], entrySeq: number | undefined, line: number): void {
  if (looksLikeSecret(value)) {
    findings.push({
      id: 'secret-in-trail', severity: 'warning', seq: entrySeq, line,
      message: `Secret-shaped value found at ${path} in audit entry (line ${line})`,
      suggestion: 'Redact secrets before writing audit entries; rotate any value that leaked into the trail.',
    })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => deepSecretScan(v, `${path}[${i}]`, findings, entrySeq, line))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      deepSecretScan(v, `${path}.${k}`, findings, entrySeq, line)
    }
  }
}

/** Run the audit trail pass. */
export function runAuditScan(root: string): AuditReport {
  const scannedAt = Date.now()
  const findings: AuditFinding[] = []
  const entries: AuditEntry[] = []
  let filesScanned = 0

  let dir: string | null = null
  for (const candidate of AUDIT_DIRS) {
    if (existsSync(join(root, candidate))) {
      dir = join(root, candidate)
      break
    }
  }

  if (!dir) {
    findings.push({
      id: 'no-trail', severity: 'info',
      message: 'No audit trail found (.vectalon/audit or audit).',
      suggestion: 'Have agents append JSONL audit entries (seq, timestamp, actor, action) so the org has an immutable trail.',
    })
  } else {
    const files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()
    filesScanned = files.length
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
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
      let prevSeq: number | undefined
      for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1
        const entry = parseAuditLine(lines[i], lineNo)
        if (!entry) {
          findings.push({
            id: 'malformed-entry', severity: 'warning', line: lineNo,
            message: `Malformed audit entry in ${file} (line ${lineNo})`,
            suggestion: 'Fix or remove the malformed JSONL line so the trail stays parseable.',
          })
          continue
        }
        if (entry.seq === undefined) {
          findings.push({
            id: 'missing-seq', severity: 'info', line: lineNo,
            message: `Audit entry in ${file} (line ${lineNo}) has no sequence number`,
            suggestion: 'Add a monotonic `seq` field so trail continuity can be verified.',
          })
        } else if (prevSeq !== undefined && entry.seq !== prevSeq + 1) {
          findings.push({
            id: 'trail-gap', severity: 'warning', seq: entry.seq, line: lineNo,
            message: `Sequence gap in ${file}: ${prevSeq} → ${entry.seq} (line ${lineNo})`,
            suggestion: 'Check whether entries were deleted or a writer skipped — gaps break immutability guarantees.',
          })
        }
        if (entry.seq !== undefined) prevSeq = entry.seq
        deepSecretScan(entry, 'entry', findings, entry.seq, lineNo)
        entries.push(entry)
      }
    }
    if (filesScanned === 0) {
      findings.push({
        id: 'no-trail', severity: 'info',
        message: 'The audit directory exists but contains no .jsonl files.',
        suggestion: 'Append audit entries as JSONL so the trail builds up over time.',
      })
    }
  }

  // Summarize by actor and action.
  const byActor = new Map<string, number>()
  const byAction = new Map<string, number>()
  const byOutcome = new Map<string, number>()
  for (const e of entries) {
    if (e.actor) byActor.set(e.actor, (byActor.get(e.actor) ?? 0) + 1)
    byAction.set(e.action, (byAction.get(e.action) ?? 0) + 1)
    byOutcome.set(e.outcome ?? 'unknown', (byOutcome.get(e.outcome ?? 'unknown') ?? 0) + 1)
  }
  const summary: AuditSummary = {
    entries: entries.length,
    files: filesScanned,
    actors: [...byActor.entries()].map(([actor, count]) => ({ actor, count })).sort((a, b) => b.count - a.count),
    actions: [...byAction.entries()].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    outcomes: Object.fromEntries(byOutcome),
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: AuditReport['verdict'] = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, summary, findings, verdict, total: { total: findings.length, bySeverity } }
}

/** Render the audit report as markdown. */
export function renderAuditMarkdown(report: AuditReport): string {
  const lines = ['# vectalon audit — Org-wide Audit Trail', '']
  lines.push(`Entries: ${report.summary.entries}  ·  Files: ${report.summary.files}  ·  Verdict: **${report.verdict}**`, '')
  if (report.summary.actors.length > 0) {
    lines.push('', '## Activity by actor', '', '| Actor | Entries |', '|---|---|')
    for (const a of report.summary.actors.slice(0, 15)) lines.push(`| ${a.actor} | ${a.count} |`)
  }
  if (report.summary.actions.length > 0) {
    lines.push('', '## Activity by action', '', '| Action | Count |', '|---|---|')
    for (const a of report.summary.actions.slice(0, 15)) lines.push(`| ${a.action} | ${a.count} |`)
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '')
    for (const f of report.findings) {
      const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
      const where = f.line !== undefined ? ` (line ${f.line})` : ''
      lines.push(`### [${mark}] ${f.id}${where}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeAuditReport(root: string, report: AuditReport): { mdPath: string; jsonPath: string } {
  const dir = auditDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderAuditMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}

/** Report path helpers shared with the CLI. */
export function auditReportPaths(root: string): { md: string; json: string } {
  const dir = auditDocsDir(root)
  return { md: relative(root, join(dir, 'report.md')), json: relative(root, join(dir, 'report.json')) }
}
