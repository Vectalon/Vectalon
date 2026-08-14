/**
 * vectalon soc2 — SOC2 Readiness Agent (Roadmap Phase 9, item 075)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Probes the repo for evidence mapped to the SOC2 trust service criteria.
 * This is a readiness self-assessment, not an audit — it surfaces which
 * controls have in-repo evidence and which need process/docs. Reports to
 * docs/vectalon/soc2/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Soc2Control, Soc2Report } from './types'

export type { Soc2Control, Soc2Report } from './types'

/** Where soc2 reports are written. */
export const soc2DocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'soc2')

function fileExists(root: string, ...parts: string[]): boolean {
  return existsSync(join(root, ...parts))
}

function contains(root: string, rel: string, pattern: RegExp): boolean {
  try {
    return pattern.test(readFileSync(join(root, rel), 'utf-8'))
  } catch {
    return false
  }
}

/** Any file under a dir matching the regex (shallow walk, skips node_modules). */
function anyFileMatches(root: string, dir: string, pattern: RegExp): boolean {
  const base = join(root, dir)
  if (!existsSync(base)) return false
  const walk = (d: string): boolean => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'build', 'dist', 'Pods'].includes(entry.name)) continue
        if (walk(p)) return true
      } else if (pattern.test(entry.name)) {
        return true
      }
    }
    return false
  }
  return walk(base)
}

function hasDependency(root: string, name: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name])
  } catch {
    return false
  }
}

/** Run the SOC2 readiness pass. */
export function runSoc2Scan(root: string): Soc2Report {
  const scannedAt = Date.now()
  const controls: Soc2Control[] = []
  const c = (id: string, criteria: string, title: string, status: Soc2Control['status'], evidence: string, suggestion: string) =>
    controls.push({ id, criteria, title, status, evidence, suggestion })

  // Security (access control)
  const authLib = ['@react-native-async-storage/async-storage', 'expo-secure-store', 'keychain', 'react-native-keychain', 'bcrypt', 'jsonwebtoken', 'jose'].find(name => hasDependency(root, name))
  c('access-control', 'Security', 'Authentication & authorization library in use',
    authLib ? 'pass' : 'partial',
    authLib ? `dependency found: ${authLib}` : 'no auth/credential library declared',
    authLib ? '' : 'Adopt a credential/session library (expo-secure-store, react-native-keychain, jose) and document the auth flow.')

  const envIgnored = existsSync(join(root, '.gitignore')) && contains(root, '.gitignore', /\.env/)
  c('secrets-hygiene', 'Security', 'Secrets excluded from version control',
    envIgnored ? 'pass' : 'fail',
    envIgnored ? '.env is present in .gitignore' : '.env not found in .gitignore',
    'Add .env (and .env.*) to .gitignore so secrets never enter the repository.')

  const lockfile = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].find(f => fileExists(root, f))
  c('dependency-pinning', 'Security', 'Dependencies locked for reproducible builds',
    lockfile ? 'pass' : 'fail',
    lockfile ? `${lockfile} committed` : 'no lockfile found',
    'Commit a lockfile (package-lock.json / yarn.lock / pnpm-lock.yaml) for reproducible, auditable dependency sets.')

  // Availability
  const ciWorkflows = existsSync(join(root, '.github', 'workflows'))
  c('ci-pipeline', 'Availability', 'CI pipeline with tests',
    ciWorkflows ? 'pass' : 'fail',
    ciWorkflows ? '.github/workflows present' : 'no CI workflows found',
    'Add CI that runs tests on every push — SOC2 expects automated regression coverage.')

  // Processing integrity
  const testFiles = anyFileMatches(root, '.', /\.(test|spec)\.(ts|tsx|js|jsx)$/)
  c('test-coverage', 'Processing Integrity', 'Automated tests in the repository',
    testFiles ? 'pass' : 'partial',
    testFiles ? 'test files detected' : 'no test files detected',
    'Add unit/integration tests for core flows — processing integrity needs verifiable behavior.')

  // Confidentiality
  const tlsEvidence = contains(root, 'package.json', /https:\/\/|tls|ssl/i) || anyFileMatches(root, 'ios', /Info\.plist$/) && contains(root, 'ios', /NSAppTransportSecurity/i)
  c('encryption-in-transit', 'Confidentiality', 'Encrypted communication (TLS)',
    tlsEvidence ? 'pass' : 'partial',
    tlsEvidence ? 'TLS/HTTPS usage found in config' : 'no explicit TLS configuration found',
    'Ensure every API endpoint uses HTTPS and ATS is not disabled.')

  const privacyDoc = ['PRIVACY.md', 'privacy.md', 'PRIVACY_POLICY.md'].find(f => fileExists(root, f))
  c('privacy-policy', 'Privacy', 'Privacy policy documented',
    privacyDoc ? 'pass' : 'fail',
    privacyDoc ? `${privacyDoc} found` : 'no privacy policy document found',
    'Document data collection, retention, and deletion — required for the Privacy criterion.')

  // Audit logging
  const loggingLib = ['pino', 'winston', 'bunyan', 'react-native-logs', 'loglevel'].find(name => hasDependency(root, name))
  c('audit-logging', 'Security', 'Structured logging for audit trails',
    loggingLib ? 'pass' : 'partial',
    loggingLib ? `logging dependency found: ${loggingLib}` : 'no structured logging library declared',
    loggingLib ? '' : 'Adopt a structured logger and log auth events, admin actions, and errors with timestamps.')

  // Availability — backups
  const backupEvidence = anyFileMatches(root, '.', /backup|snapshot/i) || contains(root, 'package.json', /backup|s3|blob/i)
  c('backups', 'Availability', 'Data backup strategy in place',
    backupEvidence ? 'partial' : 'fail',
    backupEvidence ? 'backup-related code/docs found' : 'no backup strategy found in the repo',
    'Document and automate database/state backups with recovery-time objectives (RTO/RPO).')

  // Incident response
  const incidentDoc = ['INCIDENT.md', 'RUNBOOK.md', 'runbook', 'incident-response'].find(f => fileExists(root, f) || contains(root, 'docs', new RegExp(f, 'i')))
  c('incident-response', 'Security', 'Incident response runbook',
    incidentDoc ? 'pass' : 'fail',
    incidentDoc ? `${incidentDoc} found` : 'no incident response runbook found',
    'Write an INCIDENT.md runbook: severity levels, on-call, containment steps, postmortem template.')

  // Vendor management
  c('vendor-assessment', 'Security', 'Dependency vulnerability scanning',
    contains(root, 'package.json', /audit|snyk|dependabot|renovate/i) || ciWorkflows ? 'partial' : 'fail',
    'npm audit / dependabot / renovate configured' ,
    'Run `npm audit` in CI (or enable Dependabot) so vulnerable dependencies are caught continuously.')

  const pass = controls.filter(x => x.status === 'pass').length
  const partial = controls.filter(x => x.status === 'partial').length
  const fail = controls.filter(x => x.status === 'fail').length
  const score = Math.round(((pass + partial * 0.5) / controls.length) * 100)
  const verdict: Soc2Report['verdict'] = fail > 0 ? 'changes-requested' : partial > 0 ? 'needs-attention' : 'approved'
  return { scannedAt, root, controls, score, verdict, summary: { total: controls.length, pass, partial, fail } }
}

/** Render the readiness checklist as markdown. */
export function renderSoc2Markdown(report: Soc2Report): string {
  const lines = ['# vectalon soc2 — SOC2 Readiness', '']
  lines.push(`Score: **${report.score}%** (${report.summary.pass} pass, ${report.summary.partial} partial, ${report.summary.fail} fail)  ·  Verdict: **${report.verdict}**`, '')
  lines.push('', '> This is a repository-evidence self-assessment, not an audit. A passing', '> score means the in-repo evidence exists; the audit itself needs process and', '> personnel evidence.', '')
  for (const ctrl of report.controls) {
    const icon = ctrl.status === 'pass' ? '✅' : ctrl.status === 'partial' ? '⚠️' : ctrl.status === 'n/a' ? '⏭️' : '❌'
    lines.push(`### ${icon} [${ctrl.criteria}] ${ctrl.title} — ${ctrl.status}`, '', `- **Evidence**: ${ctrl.evidence || 'none'}`)
    if (ctrl.suggestion) lines.push(`- **Next step**: ${ctrl.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeSoc2Report(root: string, report: Soc2Report): { mdPath: string; jsonPath: string } {
  const dir = soc2DocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderSoc2Markdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
