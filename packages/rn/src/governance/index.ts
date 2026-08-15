/**
 * vectalon governance — Enterprise Governance Agent (Roadmap Phase 10, item 083)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass: check the repo for enterprise-governance evidence —
 * license, security policy, contributing guide, CODEOWNERS, PR template,
 * SBOM, dependency policy — and flag what's missing. Reports to
 * docs/vectalon/governance/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { GovCheck, GovFinding, GovReport } from './types'

export type { GovCheck, GovFinding, GovReport } from './types'

/** Where governance reports are written. */
export const govDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'governance')

const MARKDOWN_NAMES = ['.md', '.markdown', '']

function findFile(root: string, names: string[]): string | null {
  for (const name of names) {
    for (const ext of MARKDOWN_NAMES) {
      const p = join(root, `${name}${ext}`)
      if (existsSync(p)) return p
    }
  }
  return null
}

/** Run the governance evidence pass. */
export function runGovScan(root: string): GovReport {
  const scannedAt = Date.now()
  const checks: GovCheck[] = []
  const findings: GovFinding[] = []

  const license = findFile(root, ['LICENSE', 'LICENCE', 'LICENSE.txt', 'LICENSE.md'])
  checks.push({
    id: 'license', label: 'License file', status: license ? 'pass' : 'fail',
    evidence: license ? 'LICENSE present' : 'no LICENSE file at repo root',
    detail: license ? readFileSync(license, 'utf-8').split('\n').slice(0, 3).join(' ').slice(0, 140) : 'Add a LICENSE so downstream consumers know their rights.',
  })

  const security = findFile(root, ['SECURITY', 'SECURITY.md', '.github/SECURITY'])
  checks.push({
    id: 'security-policy', label: 'Security policy', status: security ? 'pass' : 'fail',
    evidence: security ? 'SECURITY.md present' : 'no SECURITY.md (or .github/SECURITY.md)',
    detail: security ? 'Vulnerability reporting path documented.' : 'Document how to privately report a vulnerability.',
  })

  const contributing = findFile(root, ['CONTRIBUTING', 'CONTRIBUTING.md'])
  checks.push({
    id: 'contributing', label: 'Contributing guide', status: contributing ? 'pass' : 'warn',
    evidence: contributing ? 'CONTRIBUTING present' : 'no CONTRIBUTING.md',
    detail: contributing ? 'Contribution workflow documented.' : 'Add a contributing guide so external contributors know the workflow.',
  })

  const codeowners = findFile(root, ['CODEOWNERS', '.github/CODEOWNERS'])
  checks.push({
    id: 'codeowners', label: 'CODEOWNERS', status: codeowners ? 'pass' : 'warn',
    evidence: codeowners ? 'CODEOWNERS present' : 'no CODEOWNERS (or .github/CODEOWNERS)',
    detail: codeowners ? 'Required reviewers are defined per path.' : 'Add CODEOWNERS so the right people review sensitive paths.',
  })

  const prTemplate = findFile(root, ['PULL_REQUEST_TEMPLATE', '.github/pull_request_template', 'docs/pull_request_template'])
  checks.push({
    id: 'pr-template', label: 'PR template', status: prTemplate ? 'pass' : 'warn',
    evidence: prTemplate ? 'PR template present' : 'no PR template',
    detail: prTemplate ? 'PRs are structured consistently.' : 'Add a PR template with checklist + test instructions.',
  })

  // SBOM: package-lock / pnpm-lock / yarn.lock imply a lockfile; a real SBOM is stronger.
  const lockfiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].filter(n => existsSync(join(root, n)))
  checks.push({
    id: 'lockfile', label: 'Lockfile', status: lockfiles.length > 0 ? 'pass' : 'fail',
    evidence: lockfiles.length > 0 ? lockfiles.join(', ') : 'no lockfile found',
    detail: lockfiles.length > 0 ? 'Dependency versions are pinned by a lockfile.' : 'Commit a lockfile so builds are reproducible.',
  })

  const sbom = findFile(root, ['sbom', 'SBOM', 'cyclonedx', 'syft'])
  checks.push({
    id: 'sbom', label: 'SBOM', status: sbom ? 'pass' : 'warn',
    evidence: sbom ? 'SBOM file present' : 'no SBOM (sbom.json / cyclonedx)',
    detail: sbom ? 'A software bill of materials is committed.' : 'Generate an SBOM (e.g. `syft dir:. -o cyclonedx-json`) for supply-chain visibility.',
  })

  const dependabot = existsSync(join(root, '.github', 'dependabot.yml')) || existsSync(join(root, '.github', 'dependabot.yaml'))
  checks.push({
    id: 'dependabot', label: 'Dependabot', status: dependabot ? 'pass' : 'warn',
    evidence: dependabot ? '.github/dependabot.yml present' : 'no .github/dependabot.yml',
    detail: dependabot ? 'Dependency updates are automated.' : 'Add Dependabot config so dependency advisories land as PRs.',
  })

  const hasGitHub = existsSync(join(root, '.github'))
  checks.push({
    id: 'ci', label: 'CI workflows', status: hasGitHub ? 'pass' : 'warn',
    evidence: hasGitHub ? '.github/ present' : 'no .github/ directory',
    detail: hasGitHub ? 'GitHub Actions workflows are configured.' : 'Add CI so every PR is tested before merge.',
  })

  for (const check of checks) {
    if (check.status === 'fail') {
      findings.push({
        id: `missing-${check.id}`, severity: 'warning',
        message: `${check.label} is missing: ${check.detail}`,
        suggestion: check.detail,
      })
    } else if (check.status === 'warn') {
      findings.push({
        id: `missing-${check.id}`, severity: 'info',
        message: `${check.label} not found: ${check.detail}`,
        suggestion: check.detail,
      })
    }
  }

  const bySeverity: Record<string, number> = {}
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  const verdict: GovReport['verdict'] = findings.some(f => f.severity === 'warning') ? 'needs-attention' : 'approved'
  return { scannedAt, root, checks, findings, verdict, summary: { total: findings.length, bySeverity } }
}

/** Render the governance report as markdown. */
export function renderGovMarkdown(report: GovReport): string {
  const lines = ['# vectalon governance — Enterprise Governance', '']
  lines.push(`Checks: ${report.checks.length}  ·  Verdict: **${report.verdict}**`, '', '| Check | Status | Evidence |', '|---|---|---|')
  for (const c of report.checks) {
    lines.push(`| ${c.label} | ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'} ${c.status} | ${c.evidence} |`)
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '')
    for (const f of report.findings) {
      const mark = f.severity === 'warning' ? 'WARN' : 'INFO'
      lines.push(`### [${mark}] ${f.id}`, '', f.message, '', `**Fix**: ${f.suggestion}`, '')
    }
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeGovReport(root: string, report: GovReport): { mdPath: string; jsonPath: string } {
  const dir = govDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderGovMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}

/** Report path helpers shared with the CLI. */
export function govReportPaths(root: string): { md: string; json: string } {
  const dir = govDocsDir(root)
  return { md: relative(root, join(dir, 'report.md')), json: relative(root, join(dir, 'report.json')) }
}
