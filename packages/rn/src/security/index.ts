/**
 * vectalon sec — Security Review Agent (Roadmap Phase 8, item 063)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over a project that reviews its security posture:
 * hardcoded secrets (redacted in every report), unsafe code patterns, and
 * dependency advisories via best-effort `npm audit`. Secrets and patterns
 * are hermetic (pure file scans); the audit pass degrades to a skip when it
 * cannot run, so the review never fails on infrastructure. Reports to
 * docs/vectalon/sec/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { walkSecretFiles, scanSecrets } from './scan'
import { scanUnsafe } from './unsafe'
import { runNpmAudit } from './audit'
import type { SecurityAudit, SecurityFinding, SecurityOptions, SecurityReport, SecuritySummary, SecurityVerdict, SecurityVuln } from './types'

export type { SecurityFinding, SecurityAudit, SecurityOptions, SecurityReport, SecuritySummary, SecuritySeverity, SecurityCategory, SecurityVerdict, SecurityVuln } from './types'

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/** Where security reports are written (mirrors other docs/vectalon/* dirs). */
export const securityDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'sec')

/** The overall verdict: errors block, warnings need attention, else approve. */
export function verdictOf(findings: SecurityFinding[]): SecurityVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

function severityRank(sev: SecurityFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

/** Map an npm audit severity onto the review's severity scale. */
export function auditSeverity(sev: SecurityVuln['severity']): SecurityFinding['severity'] {
  return sev === 'critical' ? 'error' : sev === 'high' ? 'warning' : 'info'
}

/** Roll findings into counts + top recommendations (mirrors perf's engine). */
export function summarizeSecurity(findings: SecurityFinding[]): SecuritySummary {
  const bySeverity: SecuritySummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  const byCategory: SecuritySummary['byCategory'] = { secrets: 0, unsafe: 0, deps: 0 }
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
  }
  const ranked = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const seen = new Set<string>()
  const topRecommendations: string[] = []
  for (const f of ranked) {
    const key = `${f.id}:${f.file}:${f.line}`
    if (seen.has(key)) continue
    seen.add(key)
    topRecommendations.push(`${f.message} — ${f.suggestion} (${f.file}:${f.line})`)
    if (topRecommendations.length >= 3) break
  }
  return { total: findings.length, bySeverity, byCategory, topRecommendations }
}

/** Advisory findings from the audit (skipped audits contribute none). */
function auditFindings(audit: SecurityAudit, root: string): SecurityFinding[] {
  if (!audit.ran) return []
  const findings: SecurityFinding[] = []
  for (const vuln of audit.vulnerabilities) {
    findings.push({
      id: 'dependency-vulnerability',
      category: 'deps',
      severity: auditSeverity(vuln.severity),
      file: 'package.json',
      line: 0,
      target: vuln.package,
      message: `${vuln.package} has ${vuln.advisoryCount} advisory(ies) at ${vuln.severity} severity${vuln.isDirect ? '' : ' (transitive)'}`,
      suggestion: `Run npm audit fix${vuln.isDirect ? '' : ' and update the direct dependency that pulls it in'} — keep dependencies patched or pin to a fixed range.`,
    })
  }
  if (findings.length === 0) {
    const zero = vulnerabilitiesZero(audit)
    if (zero) {
      findings.push({
        id: 'clean-audit',
        category: 'deps',
        severity: 'info',
        file: 'package.json',
        line: 0,
        target: 'npm audit',
        message: 'No known vulnerabilities in the dependency tree.',
        suggestion: 'Keep the audit green — schedule periodic scans and update major versions deliberately.',
      })
    }
  }
  return findings
}

function vulnerabilitiesZero(audit: SecurityAudit): boolean {
  return audit.total === 0 && audit.critical === 0 && audit.high === 0 && audit.moderate === 0 && audit.low === 0
}

/** Supply-chain hygiene: a project with deps but no lockfile is unpinned. */
function lockfileFinding(root: string): SecurityFinding | null {
  const hasPackageJson = existsSync(join(root, 'package.json'))
  const hasLockfile =
    existsSync(join(root, 'package-lock.json')) ||
    existsSync(join(root, 'yarn.lock')) ||
    existsSync(join(root, 'pnpm-lock.yaml'))
  if (!hasPackageJson || hasLockfile) return null
  return {
    id: 'unlocked-dependencies',
    category: 'deps',
    severity: 'info',
    file: 'package.json',
    line: 0,
    target: 'no lockfile',
    message: 'Dependencies are not pinned — no package-lock.json, yarn.lock, or pnpm-lock.yaml found.',
    suggestion: 'Commit a lockfile so every install resolves the exact same (audited) tree — unpinned ranges drift into vulnerable versions.',
  }
}

/** Run one security-review pass over a project root. */
export async function runSecurityReview(root: string, options: SecurityOptions = {}): Promise<SecurityReport> {
  const scannedAt = Date.now()
  const findings: SecurityFinding[] = []

  // Secrets — source + config + .env* files.
  const files = walkSecretFiles(root)
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch (err) {
      reportError(err, `sec: reading ${file}`)
      continue
    }
    findings.push(...scanSecrets(file, content))
    if (SOURCE_EXTS.has(file.slice(file.lastIndexOf('.')))) {
      findings.push(...scanUnsafe(file, content))
    }
  }

  // Dependency advisories — best-effort npm audit, always degrades.
  const audit = options.skipAudit
    ? { ran: false, skippedReason: 'skipped via --no-audit', total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
    : options.auditRunner
      ? (await options.auditRunner(root)) ?? { ran: false, skippedReason: 'audit runner returned nothing', total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
      : await runNpmAudit(root, options.auditTimeoutMs ?? 90000)
  findings.push(...auditFindings(audit, root))
  const unlocked = lockfileFinding(root)
  if (unlocked) findings.push(unlocked)

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id))
  return {
    scannedAt,
    root,
    fileCount: files.length,
    audit,
    findings,
    summary: summarizeSecurity(findings),
    verdict: verdictOf(findings),
  }
}

/** Human-readable markdown report (mirrors perf/diagnostics renderers). */
export function renderSecurityMarkdown(report: SecurityReport): string {
  const lines: string[] = []
  lines.push('# vectalon sec — Security Review')
  lines.push('')
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- ${report.fileCount} files scanned in ${report.root}`)
  lines.push(`- Findings: ${report.summary.total} (` +
    `${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  lines.push('')

  lines.push('## Dependency audit')
  lines.push('')
  if (!report.audit.ran) {
    lines.push(`Audit skipped — ${report.audit.skippedReason ?? 'not run'}.`)
  } else {
    lines.push(`- ${report.audit.total} advisory(ies): ${report.audit.critical} critical, ${report.audit.high} high, ${report.audit.moderate} moderate, ${report.audit.low} low`)
    if (report.audit.vulnerabilities.length > 0) {
      lines.push('')
      lines.push('| Package | Severity | Direct | Advisories |')
      lines.push('|---------|----------|--------|-----------|')
      for (const v of report.audit.vulnerabilities) {
        lines.push(`| ${v.package} | ${v.severity} | ${v.isDirect ? 'yes' : 'no'} | ${v.advisoryCount} |`)
      }
    }
  }
  lines.push('')

  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Top recommendations')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }

  lines.push('## Findings')
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('No security issues found.')
  }
  for (const f of report.findings) {
    const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${loc}`)
    lines.push('')
    lines.push(f.message)
    lines.push('')
    lines.push(`- **Target:** \`${f.target}\` · ${f.category}`)
    lines.push(`- **Fix:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/sec/ (gitignored). */
export function writeSecurityReport(root: string, report: SecurityReport): { jsonPath: string; mdPath: string } {
  const dir = securityDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderSecurityMarkdown(report))
  return { jsonPath, mdPath }
}
