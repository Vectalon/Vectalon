/**
 * vectalon release-ready — Release Readiness Agent (Roadmap Phase 8, item 069)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic checklist that answers "can we ship?": version bumped
 * past the last tag, CHANGELOG section for that version, a clean working
 * tree, CI workflows present, lockfile committed, tests configured, no
 * committed .env, and a sane TODO/FIXME count. Only read-only git commands
 * (git describe, git status, git check-ignore) run, each degrading
 * gracefully when the project is not a git repo. Reports to
 * docs/vectalon/release-ready/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../adapters/runCommand'
import { walkProjectFiles } from '../upgrade/scan'
import type { ReleaseCheck, ReleaseReadyReport, ReleaseSeverity, ReleaseSummary, ReleaseVerdict } from './types'

export type { ReleaseCheck, ReleaseReadyReport, ReleaseSummary, ReleaseSeverity, ReleaseVerdict } from './types'

/** Where release-ready reports are written (mirrors other docs/vectalon/* dirs). */
export const releaseReadyDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'release-ready')

export function verdictOf(checks: ReleaseCheck[]): ReleaseVerdict {
  if (checks.some(c => c.severity === 'error')) return 'changes-requested'
  if (checks.some(c => c.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

function severityRank(sev: ReleaseSeverity): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

async function git(root: string, args: string[]): Promise<string> {
  try {
    const result = await runCommand('git', args, { cwd: root, timeout: 15000 })
    return result.success ? result.stdout.trim() : ''
  } catch {
    return ''
  }
}

function sameOrNewer(candidate: string, baseline: string): boolean {
  const c = candidate.split('.').map(Number)
  const b = baseline.replace(/^v?/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const cv = c[i] ?? 0
    const bv = b[i] ?? 0
    if (cv > bv) return true
    if (cv < bv) return false
  }
  return true
}

/** Run every release-readiness check. */
export async function runReleaseReady(root: string): Promise<ReleaseReadyReport> {
  const scannedAt = Date.now()
  const checks: ReleaseCheck[] = []

  // Version + bump detection (read-only git).
  let version = ''
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { version?: string }
    version = pkg.version ?? ''
  } catch { /* no package.json */ }
  const lastTag = await git(root, ['describe', '--tags', '--abbrev=0'])

  if (!version) {
    checks.push({ id: 'version', severity: 'error', title: 'Version', message: 'No version found in package.json.', fix: 'Set a semver version in package.json before releasing.' })
  } else if (!lastTag) {
    checks.push({ id: 'version', severity: 'warning', title: 'Version', message: `No prior git tag found (current version ${version}) — this may be the first release.` })
  } else if (!sameOrNewer(version, lastTag)) {
    checks.push({ id: 'version', severity: 'error', title: 'Version', message: `package.json version ${version} is not newer than the last tag ${lastTag}.`, fix: 'Bump the version (semantic-release style: feat → minor, fix → patch) so the release publishes a new version.' })
  } else {
    checks.push({ id: 'version', severity: 'info', title: 'Version', message: `Version ${version} is newer than the last tag ${lastTag}.` })
  }

  // CHANGELOG section for the current version.
  let changelog = ''
  try {
    changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8')
  } catch { /* no changelog */ }
  const hasSection = version ? new RegExp(`## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`).test(changelog) : false
  if (!changelog) {
    checks.push({ id: 'changelog', severity: 'warning', title: 'Changelog', message: 'No CHANGELOG.md found.', fix: 'Keep a changelog — releases without release notes are invisible to users.' })
  } else if (!hasSection) {
    checks.push({ id: 'changelog', severity: 'warning', title: 'Changelog', message: `CHANGELOG.md has no \`## [${version}]\` section for the current version.`, fix: 'Move the unreleased entries into a dated section for this version before shipping.' })
  } else {
    checks.push({ id: 'changelog', severity: 'info', title: 'Changelog', message: `CHANGELOG.md has a section for ${version}.` })
  }

  // Clean working tree.
  const status = await git(root, ['status', '--porcelain'])
  if (!status && !existsSync(join(root, '.git'))) {
    checks.push({ id: 'clean-tree', severity: 'info', title: 'Working tree', message: 'Not a git repository — skipping tree checks.' })
  } else if (status) {
    const dirty = status.split('\n').filter(Boolean)
    checks.push({ id: 'clean-tree', severity: 'warning', title: 'Working tree', message: `${dirty.length} uncommitted change(s) — a release should ship from a clean tree.`, fix: 'Commit (or stash) the outstanding changes so the release maps to a known revision.' })
  } else {
    checks.push({ id: 'clean-tree', severity: 'info', title: 'Working tree', message: 'Working tree is clean.' })
  }

  // CI workflows.
  const workflowsDir = join(root, '.github', 'workflows')
  if (existsSync(workflowsDir)) {
    const count = readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).length
    checks.push({ id: 'ci', severity: 'info', title: 'CI', message: `${count} GitHub Actions workflow(s) present — confirm one runs tests and one can publish.` })
  } else {
    checks.push({ id: 'ci', severity: 'warning', title: 'CI', message: 'No .github/workflows directory — nothing runs tests or publishes on push.', fix: 'Add CI (tests + typecheck) and a publish workflow before releasing.' })
  }

  // Lockfile.
  const hasLockfile = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].some(f => existsSync(join(root, f)))
  checks.push({
    id: 'lockfile', severity: hasLockfile ? 'info' : 'warning', title: 'Lockfile',
    message: hasLockfile ? 'Dependencies are locked.' : 'No lockfile committed — installs are not reproducible.',
    fix: hasLockfile ? undefined : 'Commit the lockfile so the release build resolves the exact tested tree.',
  })

  // Tests configured.
  let pkgJson: Record<string, unknown> = {}
  try {
    pkgJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as Record<string, unknown>
  } catch { /* missing */ }
  const scripts = pkgJson.scripts as Record<string, string> | undefined
  const hasTests = Boolean(scripts?.test) || existsSync(join(root, 'jest.config.js')) || existsSync(join(root, 'jest.config.ts'))
  checks.push({
    id: 'tests', severity: hasTests ? 'info' : 'warning', title: 'Tests',
    message: hasTests ? 'A test script / jest config is configured.' : 'No test script or jest config found.',
    fix: hasTests ? undefined : 'Add a test script (jest) so the release pipeline can gate on tests.',
  })

  // .env committed?
  if (existsSync(join(root, '.env'))) {
    const ignored = await git(root, ['check-ignore', '.env'])
    if (!ignored) {
      checks.push({ id: 'env-hygiene', severity: 'error', title: 'Secrets hygiene', message: '.env exists and is not git-ignored — secrets may ship with the release.', fix: 'Add .env to .gitignore, remove it from the tree/history, and load secrets from the CI secret store.' })
    } else {
      checks.push({ id: 'env-hygiene', severity: 'info', title: 'Secrets hygiene', message: '.env is present but git-ignored.' })
    }
  } else {
    checks.push({ id: 'env-hygiene', severity: 'info', title: 'Secrets hygiene', message: 'No .env file in the tree.' })
  }

  // TODO/FIXME count across source.
  const todoFiles = walkProjectFiles(root)
  let todos = 0
  for (const file of todoFiles) {
    try {
      const content = readFileSync(join(root, file), 'utf-8')
      todos += (content.match(/\b(?:TODO|FIXME)\b/g) ?? []).length
    } catch { /* skip */ }
  }
  checks.push({
    id: 'todo-count', severity: todos > 20 ? 'warning' : 'info', title: 'Open markers',
    message: `${todos} TODO/FIXME marker(s) across ${todoFiles.length} source files.`,
    fix: todos > 20 ? 'Triage the markers before release — a high count usually hides unfinished work.' : undefined,
  })

  checks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  return {
    scannedAt,
    root,
    version,
    lastTag,
    checks,
    summary: summarizeReleaseReady(checks),
    verdict: verdictOf(checks),
  }
}

/** Roll checks into counts + top recommendations. */
export function summarizeReleaseReady(checks: ReleaseCheck[]): ReleaseSummary {
  const bySeverity: ReleaseSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  for (const c of checks) bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1
  const ranked = [...checks].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const topRecommendations = ranked.filter(c => c.severity !== 'info').slice(0, 3).map(c => `${c.message} ${c.fix ?? ''}`.trim())
  return { total: checks.length, bySeverity, topRecommendations }
}

/** Human-readable markdown report. */
export function renderReleaseReadyMarkdown(report: ReleaseReadyReport): string {
  const lines: string[] = []
  lines.push('# vectalon release-ready — Release Readiness')
  lines.push('')
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- Version: ${report.version || '(none)'} | Last tag: ${report.lastTag || '(none)'}`)
  lines.push(`- Checks: ${report.summary.total} (` +
    `${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  lines.push('')
  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Before you ship')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }
  lines.push('## Checklist')
  lines.push('')
  for (const c of report.checks) {
    const icon = c.severity === 'error' ? '✖' : c.severity === 'warning' ? '▲' : '✓'
    lines.push(`- ${icon} **${c.title}**: ${c.message}${c.fix ? ` — ${c.fix}` : ''}`)
  }
  lines.push('')
  lines.push(report.verdict === 'approved' ? '**Ship it.**' : '**Not ready — address the errors and warnings above.**')
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/release-ready/ (gitignored). */
export function writeReleaseReadyReport(root: string, report: ReleaseReadyReport): { jsonPath: string; mdPath: string } {
  const dir = releaseReadyDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderReleaseReadyMarkdown(report))
  return { jsonPath, mdPath }
}
