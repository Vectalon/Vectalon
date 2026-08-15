/**
 * vectalon train — Release Train Automation (Roadmap Phase 11, item 098)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Dry-run release planning across every workspace repo: version vs last
 * tag, changelog section, clean tree, and a suggested semver bump from
 * recent commit types. Read-only — the plan is the deliverable. Reports
 * to docs/vectalon/train/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { TrainRepo, TrainReport, TrainVerdict } from './types'

export type { TrainRepo, TrainReport, TrainVerdict } from './types'

/** Where train reports are written. */
export const trainDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'train')

/** Discover workspace members: package.json workspaces (array or object form). */
export function workspaceMembers(root: string): string[] {
  const members: string[] = ['.']
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { workspaces?: string[] | { packages?: string[] } }
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages
    if (ws) {
      for (const pattern of ws) {
        // Normalize trailing globs: "packages/*" and "packages/**" both mean "every package under packages/".
        const normalized = pattern.replace(/\*+$/, '')
        if (!normalized || normalized === pattern) {
          if (existsSync(join(root, pattern, 'package.json'))) members.push(pattern)
          continue
        }
        const base = normalized
        if (existsSync(join(root, base, 'package.json'))) {
          members.push(base)
        } else if (existsSync(join(root, base))) {
          for (const sub of readdirSafe(join(root, base))) {
            if (existsSync(join(root, base, sub, 'package.json'))) members.push(join(base, sub))
          }
        }
      }
    }
  } catch { /* no package.json workspaces */ }
  return [...new Set(members)]
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  } catch {
    return []
  }
}

const runGit = (root: string, args: string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).toString().trim()
  } catch {
    return null
  }
}

function lastTag(root: string): string | null {
  const tags = runGit(root, ['tag', '--sort=-version:refname'])
  return tags ? tags.split('\n')[0] || null : null
}

function isDirty(root: string): boolean {
  const out = runGit(root, ['status', '--porcelain'])
  return !!out && out.length > 0
}

/** Suggest a semver bump from recent commit types (read-only). */
export function suggestBump(root: string): TrainRepo['suggestedBump'] {
  const log = runGit(root, ['log', '--format=%s', '-n 30'])
  if (!log) return 'unknown'
  const messages = log.split('\n')
  if (messages.some(m => /^(feat|fix|docs|chore|refactor|perf|build|ci|test|website|dashboard|feat\([^)]*\)|fix\([^)]*\))\S*!:/i.test(m) || /!:\s/.test(m))) return 'major'
  if (messages.some(m => /^feat/i.test(m))) return 'minor'
  if (messages.some(m => /^fix|^docs|^chore|^refactor|^perf|^build|^ci|^test|^website/i.test(m))) return 'patch'
  return 'none'
}

/** Build the plan for one repo member. */
export function planRepo(root: string, member: string, name: string): TrainRepo {
  const dir = member === '.' ? root : join(root, member)
  let version: string | null = null
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { version?: string; name?: string }
    version = pkg.version ?? null
    name = name || pkg.name || member
  } catch { /* no package.json */ }

  const tag = lastTag(dir)
  const dirty = isDirty(dir)
  const changelogSection = version
    ? (() => {
        try {
          const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8')
          return new RegExp(`## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`).test(changelog)
        } catch {
          return false
        }
      })()
    : false

  const checks: TrainRepo['checks'] = []
  if (!version) {
    checks.push({ id: 'version', severity: 'warning', message: 'No version in package.json.', fix: 'Set a semver version before releasing.' })
  } else if (tag === null) {
    checks.push({ id: 'first-release', severity: 'info', message: `No prior tag — version ${version} would be the first release.`, fix: 'Confirm the version is intentional.' })
  }
  if (!changelogSection) {
    checks.push({ id: 'changelog', severity: 'warning', message: 'No CHANGELOG section for the current version.', fix: 'Add release notes under the version heading.' })
  }
  if (dirty) {
    checks.push({ id: 'dirty', severity: 'warning', message: 'Working tree is not clean.', fix: 'Commit or stash changes before cutting the release.' })
  }

  const suggestedBump = suggestBump(dir)
  return { name, path: member, version, lastTag: tag, changelogSection, dirty, suggestedBump, checks }
}

/** Run the release-train dry-run. */
export function runTrain(root: string): TrainReport {
  const scannedAt = Date.now()
  const members = workspaceMembers(root)
  const repos: TrainRepo[] = []
  const findings: TrainReport['findings'] = []

  for (const member of members) {
    const repo = planRepo(root, member, '')
    repos.push(repo)
    for (const c of repo.checks) {
      if (c.severity === 'warning') {
        findings.push({ id: c.id, severity: 'warning', repo: repo.name, message: c.message, suggestion: c.fix })
      }
    }
  }

  const blocked = repos.some(r => r.checks.some(c => c.severity === 'warning'))
  const verdict: TrainVerdict = blocked ? 'changes-requested' : 'approved'
  return { scannedAt, root, repos, findings, verdict }
}

/** Render the plan as markdown. */
export function renderTrainMarkdown(report: TrainReport): string {
  const lines = ['# vectalon train — Release Train (dry-run)', '']
  lines.push(`Repos: ${report.repos.length}  ·  Verdict: **${report.verdict}**  ·  Read-only: nothing was modified`, '')
  for (const r of report.repos) {
    lines.push(`## ${r.name}`, '')
    lines.push(`Version: ${r.version ?? '—'}  ·  Last tag: ${r.lastTag ?? '—'}  ·  Suggested bump: **${r.suggestedBump}**  ·  Changelog: ${r.changelogSection ? '✓' : '✗'}  ·  Clean tree: ${r.dirty ? '✗' : '✓'}`, '')
    for (const c of r.checks) lines.push(`- [${c.severity.toUpperCase()}] ${c.message} — ${c.fix}`)
    lines.push('')
  }
  lines.push('## Findings', '')
  for (const f of report.findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} (${f.repo})`, '', f.message, '', `**Suggestion**: ${f.suggestion}`, '')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeTrainReport(root: string, report: TrainReport): { mdPath: string; jsonPath: string } {
  const dir = trainDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderTrainMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
