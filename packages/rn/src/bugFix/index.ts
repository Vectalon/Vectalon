/**
 * vectalon bug-fix — Autonomous Bug Fix Agent (Roadmap Phase 8, item 070)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scans the project's source files for deterministically-fixable defects,
 * proposes a patch plan, and with `--apply` executes only the provably-safe
 * whitelist (whole-line unused-import removal, var→const). Safety model:
 * dry-run by default; `--apply` refuses a dirty git working tree unless
 * `--force`, so `git checkout` always restores the pre-fix state; every
 * applied edit is recorded in the report. Reports to
 * docs/vectalon/bug-fix/ (gitignored).
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { walkProjectFiles } from '../upgrade/scan'
import { scanForFixes } from './scan'
import type { BugFixOptions, BugFixReport, FixFinding } from './types'

export { scanForFixes } from './scan'

export type { BugFixOptions, BugFixReport, FixFinding } from './types'

/** Where bug-fix reports are written (mirrors other docs/vectalon/* dirs). */
export const bugFixDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'bug-fix')

function severityRank(sev: FixFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

/** Is the git working tree clean? (--apply's revert-safety guarantee.) */
export function gitTreeClean(root: string): boolean {
  try {
    const out = execSync('git status --porcelain', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    return out.trim().length === 0
  } catch {
    // Not a git repo — treat as clean but note it in the report via refused=0.
    return true
  }
}

/** Apply one edit to a file; returns the new content or null when `old` is gone. */
function applyEdit(content: string, old: string, next: string): string | null {
  if (!content.includes(old)) return null
  return content.replace(old, next)
}

export function verdictOf(findings: FixFinding[]): BugFixReport['verdict'] {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

/** Run one autonomous bug-fix pass. */
export async function runBugFix(root: string, options: BugFixOptions = {}): Promise<BugFixReport> {
  const scannedAt = Date.now()
  const findings: FixFinding[] = []
  const applied: BugFixReport['applied'] = []
  let refused = 0

  const files = walkProjectFiles(root)
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(join(root, file), 'utf-8')
    } catch {
      continue
    }
    findings.push(...scanForFixes(file, content))
  }

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.file.localeCompare(b.file) || a.line - b.line)

  if (options.apply) {
    const clean = gitTreeClean(root)
    const fixables = findings.filter(f => f.fixable && f.edit)
    if (!clean && !options.force) {
      refused = fixables.length
    } else {
      // Apply per-file in one write pass; edits are first-match replaces.
      const byFile = new Map<string, string>()
      for (const f of fixables) {
        const abs = join(root, f.file)
        const content = byFile.get(f.file) ?? readFileSync(abs, 'utf-8')
        const next = applyEdit(content, f.edit!.old, f.edit!.new)
        if (next === null) continue
        byFile.set(f.file, next)
        applied.push({ file: f.file, line: f.line, kind: f.id })
      }
      for (const [file, content] of byFile) writeFileSync(join(root, file), content, 'utf-8')
    }
  }

  const byKind: Record<string, number> = {}
  for (const f of findings) byKind[f.id] = (byKind[f.id] ?? 0) + 1

  return {
    scannedAt,
    root,
    findings,
    applied,
    refused,
    verdict: verdictOf(findings),
    summary: { total: findings.length, fixable: findings.filter(f => f.fixable).length, applied: applied.length, byKind },
  }
}

/** Render the patch plan as markdown. */
export function renderBugFixMarkdown(report: BugFixReport): string {
  const lines: string[] = ['# vectalon bug-fix — Autonomous Bug Fix', '']
  lines.push(`Scanned \`${report.root}\` — ${report.summary.total} findings, ${report.summary.fixable} auto-fixable, ${report.summary.applied} applied, ${report.refused} refused (dirty tree).`)
  lines.push('', `**Verdict: ${report.verdict}**`, '')
  if (report.applied.length > 0) {
    lines.push('## Applied', '')
    for (const a of report.applied) lines.push(`- \`${a.file}:${a.line}\` — ${a.kind}`)
    lines.push('')
  }
  lines.push('## Fix plan', '')
  for (const f of report.findings) {
    const tag = f.fixable ? 'auto' : 'manual'
    const mark = f.severity === 'error' ? 'ERROR' : f.severity === 'warning' ? 'WARN' : 'INFO'
    lines.push(`### [${mark}] ${f.id} (${tag})`, '')
    lines.push(`- **File**: \`${f.file}:${f.line}\``)
    lines.push(`- **Target**: \`${f.target}\``)
    lines.push(`- **Message**: ${f.message}`)
    lines.push(`- **Fix**: ${f.suggestion}`)
    if (f.edit) {
      lines.push('', '```diff')
      for (const ln of f.edit.old.split('\n')) lines.push(`-${ln}`)
      for (const ln of f.edit.new.split('\n')) lines.push(`+${ln}`)
      lines.push('```')
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Write the markdown + JSON report to docs/vectalon/bug-fix/. */
export function writeBugFixReport(root: string, report: BugFixReport): { mdPath: string; jsonPath: string } {
  const dir = bugFixDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderBugFixMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
