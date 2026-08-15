/**
 * vectalon gh-sec — GitHub Security Posture Agent (Roadmap Phase 11,
 * item 093) — Business Source License 1.1 (BSL-1.1)
 *
 * Reads a JSON export (dependabot alerts, secret scanning, branch
 * protection) — or attempts the corresponding gh api calls — and produces
 * one security snapshot with remediation steps. When no data is available
 * it reports an explicit no-data verdict. Reports to
 * docs/vectalon/gh-sec/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GhSecFinding, GhSecReport, GhSecVerdict } from './types'

export type { GhSecFinding, GhSecReport, GhSecVerdict } from './types'

/** Where gh-sec reports are written. */
export const ghSecDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'gh-sec')

export interface GhSecInput {
  dependabot?: Array<{ severity?: string; state?: string }>
  secretScanning?: Array<{ state?: string }>
  branchProtection?: {
    enabled?: boolean
    requiredStatusChecks?: unknown
    enforceAdmins?: boolean
    restrictions?: unknown
    requiredPullRequestReviews?: { requiredApprovingReviewCount?: number } | null
  }
}

const CRITICAL_SEVERITIES = new Set(['critical', 'high'])

function ghApi(root: string, path: string): string | null {
  try {
    return execFileSync('gh', ['api', path, '--jq', '.'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).toString()
  } catch {
    return null
  }
}

/** Try the live gh api surface (degrading to null per surface). */
export function fetchGhSec(root: string): GhSecInput {
  const out: GhSecInput = {}
  const alerts = ghApi(root, '/repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100')
  if (alerts) {
    try {
      const arr = JSON.parse(alerts) as Array<{ severity?: string; state?: string }>
      if (Array.isArray(arr)) out.dependabot = arr
    } catch { /* ignore */ }
  }
  const secrets = ghApi(root, '/repos/{owner}/{repo}/secret-scanning/alerts?state=open&per_page=100')
  if (secrets) {
    try {
      const arr = JSON.parse(secrets) as Array<{ state?: string }>
      if (Array.isArray(arr)) out.secretScanning = arr
    } catch { /* ignore */ }
  }
  const protection = ghApi(root, '/repos/{owner}/{repo}/branches/{branch}/protection')
  if (protection) {
    try {
      const p = JSON.parse(protection) as GhSecInput['branchProtection']
      if (p) out.branchProtection = p
    } catch { /* ignore */ }
  }
  return out
}

/** Load a gh-sec export file. */
export function loadSecExport(file: string): GhSecInput | null {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as GhSecInput
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Compute the security posture from the input shape. */
export function analyzeSec(input: GhSecInput): Omit<GhSecReport, 'scannedAt' | 'root' | 'source'> {
  const findings: GhSecFinding[] = []
  const dependabot = (input.dependabot ?? []).filter(a => a.state !== 'dismissed')
  const critical = dependabot.filter(a => CRITICAL_SEVERITIES.has((a.severity ?? '').toLowerCase())).length
  const high = critical
  const medium = dependabot.filter(a => (a.severity ?? '').toLowerCase() === 'medium').length
  const openSecrets = (input.secretScanning ?? []).filter(a => a.state !== 'resolved').length

  if (critical > 0) {
    findings.push({
      id: 'dependabot-critical',
      severity: 'warning',
      surface: 'dependabot',
      message: `${critical} open critical/high dependency alert(s) — attackers can target known CVEs in your supply chain.`,
      suggestion: 'Update the affected packages this sprint; the release train (098) should not ship while critical alerts are open.',
    })
  }
  if (openSecrets > 0) {
    findings.push({
      id: 'secrets-exposed',
      severity: 'warning',
      surface: 'secret-scanning',
      message: `${openSecrets} open secret-scanning alert(s) — credentials may be exposed in history.`,
      suggestion: 'Rotate the leaked secrets, purge them from history, and add pre-commit secret scanning.',
    })
  }
  const protection = input.branchProtection ?? {}
  const reviews = protection.requiredPullRequestReviews ?? null
  const requiresReviews = !!reviews && (reviews.requiredApprovingReviewCount ?? 0) > 0
  if (!protection.enabled) {
    findings.push({
      id: 'protection-disabled',
      severity: 'warning',
      surface: 'branch-protection',
      message: 'Branch protection is not enabled on the default branch.',
      suggestion: 'Enable protection: require PRs, status checks, and linear history before merge.',
    })
  } else if (!requiresReviews) {
    findings.push({
      id: 'review-not-required',
      severity: 'warning',
      surface: 'branch-protection',
      message: 'Branch protection exists but does not require pull-request reviews.',
      suggestion: 'Require at least one approving review so code is never merged unreviewed.',
    })
  } else {
    findings.push({
      id: 'protection-ok',
      severity: 'info',
      surface: 'branch-protection',
      message: `Branch protection requires ${reviews?.requiredApprovingReviewCount ?? 1} review(s) before merge.`,
      suggestion: 'Keep the requirement in sync with team size.',
    })
  }

  const blockers = findings.filter(f => f.id === 'dependabot-critical' || f.id === 'secrets-exposed')
  const warnings = findings.filter(f => f.severity === 'warning')
  const verdict: GhSecVerdict = blockers.length > 0 ? 'changes-requested' : warnings.length > 0 ? 'needs-attention' : 'approved'

  return {
    dependabot: { open: dependabot.length, critical, high, medium },
    secretScanning: { open: openSecrets },
    branchProtection: { enabled: !!protection.enabled, requiresReviews, requiredReviewers: reviews?.requiredApprovingReviewCount ?? 0 },
    findings,
    verdict,
  }
}

/** Run one gh-sec pass. */
export function runGhSec(root: string, options: { file?: string } = {}): GhSecReport {
  const scannedAt = Date.now()
  if (options.file) {
    const input = loadSecExport(options.file)
    if (input !== null) return { scannedAt, root, source: 'export-file', ...analyzeSec(input) }
    return {
      scannedAt, root, source: 'none',
      dependabot: { open: 0, critical: 0, high: 0, medium: 0 },
      secretScanning: { open: 0 },
      branchProtection: { enabled: false, requiresReviews: false, requiredReviewers: 0 },
      findings: [{
        id: 'file-unreadable', severity: 'warning', surface: '(all)',
        message: `Could not read security export at ${options.file}.`,
        suggestion: 'The file must be a JSON object with dependabot / secretScanning / branchProtection keys.',
      }], verdict: 'changes-requested',
    }
  }
  const input = fetchGhSec(root)
  const hasAny = input.dependabot || input.secretScanning || input.branchProtection
  if (hasAny) return { scannedAt, root, source: 'gh-api', ...analyzeSec(input) }
  return {
    scannedAt, root, source: 'none',
    dependabot: { open: 0, critical: 0, high: 0, medium: 0 },
    secretScanning: { open: 0 },
    branchProtection: { enabled: false, requiresReviews: false, requiredReviewers: 0 },
    findings: [{
      id: 'no-data', severity: 'warning', surface: '(all)',
      message: 'No GitHub security data available — gh is missing, unauthenticated, or this is not a GitHub repo.',
      suggestion: 'Install and auth the GitHub CLI, or pass --file with a gh-sec export (dependabot, secretScanning, branchProtection).',
    }], verdict: 'changes-requested',
  }
}

/** Render the security posture as markdown. */
export function renderGhSecMarkdown(report: GhSecReport): string {
  const lines = ['# vectalon gh-sec — GitHub Security Posture', '']
  const d = report.dependabot
  lines.push(
    `Source: ${report.source}  ·  Dependabot: ${d.open} open (${d.critical} critical/high)  ·  Secrets: ${report.secretScanning.open}  ·  Protection: ${report.branchProtection.enabled ? 'on' : 'off'}  ·  Verdict: **${report.verdict}**`,
    '',
  )
  lines.push('## Findings', '')
  for (const f of report.findings) {
    const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} (${f.surface})`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeGhSecReport(root: string, report: GhSecReport): { mdPath: string; jsonPath: string } {
  const dir = ghSecDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderGhSecMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
