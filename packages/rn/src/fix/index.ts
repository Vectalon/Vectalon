/**
 * vc fix — the "Fix my React Native issue" killer workflow.
 * Business Source License 1.1 (BSL-1.1)
 *
 * One command, the whole loop: understand the project → diagnose the root
 * cause → explain → propose a fix → modify the code (in a sandbox by
 * default) → run tests/build → verify → show exactly what changed, as one
 * structured verdict. Reuses the committed analyzers, the RN-required
 * version knowledge, and the command runner — zero model calls.
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../adapters/runCommand'
import { reportError } from '../utils/safe'
import { diagnose } from './diagnose'
import { planEdits } from './planner'
import { applyEdits, diffEdits, makeSandbox, applyToTree } from './apply'
import { verifyTree } from './verify'
import { computeConfidence } from './confidence'
import type { FixEdit, FixFinding, FixOptions, FixReport, FixVerdict } from './types'

export type { FixReport, FixFinding, FixEdit, FixOptions, FixVerdict, FixEvidence, FixVerification, FixSeverity } from './types'

/** Where vc fix reports are written (mirrors other docs/vectalon/* dirs). */
export const fixDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'fix')

export function verdictOf(findings: FixFinding[]): FixVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

/**
 * Run the fix loop. Default: edits apply in a sandbox copy and the diff is
 * shown; the real tree is untouched. With `apply` (and a clean git tree, or
 * --force), the edits are written in place and verification runs there too.
 */
export async function runFix(root: string, options: FixOptions = {}): Promise<FixReport> {
  const scannedAt = Date.now()
  const run = options.run ?? runCommand

  const { kind, findings } = diagnose(root, options)
  const report: FixReport = {
    scannedAt,
    root,
    issue: options.issue,
    logPath: options.log,
    kind,
    verdict: verdictOf(findings),
    findings,
    edits: [],
    diff: '',
    verification: [],
    confidence: 100,
    appliedToTree: false,
  }
  if (findings.length === 0) {
    report.confidence = computeConfidence(findings, [])
    return report
  }

  // Plan the deterministic edits.
  const edits = planEdits(root, findings)
  report.edits = edits

  // Always apply in a sandbox first — the diff is the "show what changed".
  const sandbox = makeSandbox(root)
  const sandboxApplied = applyEdits(sandbox, edits).applied
  report.diff = diffEdits(root, sandbox, sandboxApplied)

  // Optional real-tree apply (clean-tree guarded).
  let appliedToTree = false
  let refused = false
  let verifyDir = sandbox
  let gradleVerify = false
  if (options.apply) {
    const res = await applyToTree(root, edits, !!options.force, run)
    appliedToTree = !res.refused
    refused = res.refused
    if (appliedToTree) {
      verifyDir = root
      gradleVerify = true
    }
  }
  report.appliedToTree = appliedToTree

  // Verification — bounded tsc/jest (sandbox or tree) + gradle (tree only).
  report.verification = await verifyTree({ dir: verifyDir, gradle: gradleVerify, run })

  // Attach applied status to findings (drives the "Applied" verdict lines).
  const appliedKeys = new Set(sandboxApplied.map(e => editKey(e)))
  for (const f of findings) {
    if (!f.edit) {
      f.applied = 'manual'
      continue
    }
    f.applied = appliedKeys.has(editKey(f.edit)) ? 'applied' : 'manual'
    if (refused && appliedKeys.has(editKey(f.edit))) f.applied = 'no-change'
  }
  if (refused) {
    report.verification = report.verification.map(v => v.name === 'Gradle' ? { ...v, status: 'skipped', detail: 'not run — --apply refused (dirty tree)' } : v)
  }

  report.confidence = computeConfidence(findings, report.verification)

  // Clean up the sandbox.
  try {
    rmSync(sandbox, { recursive: true, force: true })
  } catch (err) {
    reportError(err, 'vc fix: cleaning up sandbox')
  }

  return report
}

function editKey(e: FixEdit): string {
  return `${e.file}\u0000${e.from}\u0000${e.to}`
}

/** Human-readable markdown report. */
export function renderFixMarkdown(report: FixReport): string {
  const lines: string[] = []
  lines.push('# vc fix — Fix my React Native issue')
  lines.push('')
  lines.push(`- Issue: **${report.issue ?? '(none — --log diagnosis)'}**`)
  if (report.logPath) lines.push(`- Build log: \`${report.logPath}\``)
  lines.push(`- Kind: **${report.kind}** · Verdict: **${report.verdict}** · Confidence: **${report.confidence}%**`)
  lines.push('')
  lines.push('## Root cause')
  lines.push('')
  const root = report.findings.find(f => f.rootCause) ?? report.findings[0]
  if (!root) {
    lines.push('No issue reproduced from the current project state.')
    return lines.join('\n')
  }
  lines.push(root.message)
  lines.push('')
  lines.push('### Evidence')
  lines.push('')
  for (const e of root.evidence) lines.push(`- \`${e.file}${e.line ? `:${e.line}` : ''}\` — ${e.detail}`)
  lines.push('')
  if (root.impact.length > 0) {
    lines.push(`### Impact (${root.impact.length} native module${root.impact.length === 1 ? '' : 's'})`)
    lines.push('')
    for (const p of root.impact) lines.push(`- \`${p}\``)
    lines.push('')
  }
  lines.push(`### Recommended fix`)
  lines.push('')
  lines.push(root.recommendedFix)
  lines.push('')
  lines.push('## Applied')
  lines.push('')
  const applied = report.findings.filter(f => f.applied === 'applied')
  const manual = report.findings.filter(f => f.applied === 'manual')
  if (applied.length === 0 && manual.length === 0) {
    lines.push('No edits — nothing to change (or --apply refused a dirty tree).')
  }
  for (const f of applied) lines.push(`- ✓ ${f.edit?.file} — ${f.edit?.summary}`)
  for (const f of manual) lines.push(`- (manual) ${f.recommendedFix}`)
  lines.push('')
  lines.push('## Verification')
  lines.push('')
  for (const v of report.verification) {
    lines.push(`- ${v.status === 'pass' ? '✓' : v.status === 'fail' ? '✖' : '○'} ${v.name} — ${v.detail}`)
  }
  if (report.diff) {
    lines.push('')
    lines.push('## Diff')
    lines.push('')
    lines.push('```diff')
    lines.push(report.diff.trimEnd())
    lines.push('```')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/fix/ (gitignored). */
export function writeFixReport(root: string, report: FixReport): { jsonPath: string; mdPath: string } {
  const dir = fixDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderFixMarkdown(report))
  return { jsonPath, mdPath }
}
