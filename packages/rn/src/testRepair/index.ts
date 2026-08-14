/**
 * vectalon test-repair — Test Repair Agent (Roadmap Phase 8, item 065)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Diagnoses a failing Jest, Detox, or Maestro test run from its output log:
 * the test kind is auto-detected from content (or forced via --jest/
 * --detox/--maestro), the matching classifier runs (this module's three
 * pattern databases), and every classified failure gets its standard fix —
 * the root cause first, then corroborating symptoms. Pure text parsing,
 * hermetic-testable, no tests are re-run. Reports to
 * docs/vectalon/test-repair/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { analyzeJestLog } from './jest'
import { analyzeDetoxLog } from './detox'
import { analyzeMaestroLog } from './maestro'
import type { LogAnalysis } from '../projectDiagnostics/types'
import type { TestKind, TestRepairFinding, TestRepairOptions, TestRepairReport, TestRepairSummary, TestRepairVerdict } from './types'

export type { TestKind, TestRepairFinding, TestRepairOptions, TestRepairReport, TestRepairSummary, TestRepairVerdict } from './types'

/** Where test-repair reports are written (mirrors other docs/vectalon/* dirs). */
export const testRepairDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'test-repair')

/** Strong, unambiguous signals per test framework, checked in this order. */
export function detectTestKind(log: string): TestKind | 'unknown' {
  const s = log
  if (/(jest-haste-map|Your test suite must contain at least one test|Jest did not exit one second|expect\(.*\)\.(?:toBe|toMatchSnapshot)|Test Suites:|Tests:|●)/i.test(s)) return 'jest'
  if (/(DetoxRuntimeError|detox build|waitFor\(.*\)\.(?:toBeVisible|toExist)|device\.launchApp|TOCTOU|element\(by\.id)/i.test(s)) return 'detox'
  if (/(maestro test|assertVisible|assertNotVisible|launchApp|extendedWaitUntil|Maestro: |Flow .* failed|Could not find element)/i.test(s)) return 'maestro'
  // No decisive signal — whichever classifier matches the most lines wins.
  const counts: Record<TestKind, number> = {
    jest: analyzeJestLog(log).matches.length,
    detox: analyzeDetoxLog(log).matches.length,
    maestro: analyzeMaestroLog(log).matches.length,
  }
  const best = (Object.keys(counts) as TestKind[]).sort((a, b) => counts[b] - counts[a])[0]
  return counts[best] > 0 ? best : 'unknown'
}

function analyzeByKind(log: string, kind: TestKind): LogAnalysis {
  switch (kind) {
    case 'jest': return analyzeJestLog(log)
    case 'detox': return analyzeDetoxLog(log)
    case 'maestro': return analyzeMaestroLog(log)
  }
}

/** The overall verdict: a classified root cause blocks, unmatched needs attention. */
export function verdictOf(findings: TestRepairFinding[]): TestRepairVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

/** Turn one classifier pass into findings: root cause error + symptoms. */
export function findingsFromAnalysis(kind: TestKind, analysis: LogAnalysis): TestRepairFinding[] {
  const findings: TestRepairFinding[] = []
  if (!analysis.rootCause) {
    findings.push({
      id: 'unmatched',
      kind,
      severity: 'warning',
      line: null,
      title: 'No known failure pattern matched',
      message: 'The log did not match a known Jest/Detox/Maestro failure class.',
      fix: 'Re-run with more verbosity (jest --verbose, detox --loglevel verbose, maestro --debug-output) and share the failing block — then check the framework version against your RN release.',
    })
    return findings
  }
  const rootLine = analysis.matches.find(m => m.id === analysis.rootCause!.id)?.line ?? null
  findings.push({
    id: analysis.rootCause.id,
    kind,
    severity: 'error',
    line: rootLine,
    title: analysis.rootCause.name,
    message: `Root cause: ${analysis.rootCause.name}${rootLine ? ` at log line ${rootLine}` : ''}.`,
    fix: analysis.rootCause.fix,
  })
  for (const m of analysis.matches) {
    if (m.id === analysis.rootCause.id) continue
    findings.push({
      id: m.id,
      kind,
      severity: 'warning',
      line: m.line,
      title: m.name,
      message: `Corroborating failure: ${m.name}${m.line ? ` at log line ${m.line}` : ''}.`,
      fix: m.fix,
    })
  }
  return findings
}

/** Run one test-repair diagnosis pass. */
export function runTestRepair(root: string, options: TestRepairOptions = {}): TestRepairReport {
  const scannedAt = Date.now()
  if (!options.log) {
    return {
      scannedAt,
      root,
      kind: 'unknown',
      detection: 'none',
      evidence: [],
      findings: [],
      summary: summarizeTestRepair([]),
      verdict: 'approved',
    }
  }
  let log: string
  try {
    if (!existsSync(options.log)) {
      throw new Error(`log file not found: ${options.log}`)
    }
    log = readFileSync(options.log, 'utf-8')
  } catch (err) {
    reportError(err, 'test-repair: reading log')
    return {
      scannedAt,
      root,
      logPath: options.log,
      kind: 'unknown',
      detection: 'none',
      evidence: [],
      findings: [],
      summary: summarizeTestRepair([]),
      verdict: 'approved',
    }
  }

  const kind = options.kind ?? detectTestKind(log)
  const findings = kind === 'unknown' ? [] : findingsFromAnalysis(kind, analyzeByKind(log, kind))
  const analysis = kind === 'unknown' ? null : analyzeByKind(log, kind)
  return {
    scannedAt,
    root,
    logPath: options.log,
    kind,
    detection: options.kind ? 'forced' : kind === 'unknown' ? 'none' : 'auto',
    evidence: analysis?.evidence ?? [],
    findings,
    summary: summarizeTestRepair(findings),
    verdict: verdictOf(findings),
  }
}

/** Roll findings into counts + the fix plan (root cause first). */
export function summarizeTestRepair(findings: TestRepairFinding[]): TestRepairSummary {
  const byKind: TestRepairSummary['byKind'] = { jest: 0, detox: 0, maestro: 0 }
  const bySeverity: TestRepairSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  }
  const fixPlan = findings.map(f => `${f.title}: ${f.fix}`)
  return { total: findings.length, byKind, bySeverity, fixPlan }
}

/** Human-readable markdown report (mirrors diagnostics renderers). */
export function renderTestRepairMarkdown(report: TestRepairReport): string {
  const lines: string[] = []
  lines.push('# vectalon test-repair — Test Fix Diagnosis')
  lines.push('')
  if (report.detection === 'none') {
    lines.push('No test log provided — pass `--log <path>` (or `--jest`/`--detox`/`--maestro` to force the kind).')
    return lines.join('\n')
  }
  lines.push(`- Test framework: **${report.kind}** (${report.detection === 'forced' ? 'forced' : 'auto-detected'})`)
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- Findings: ${report.summary.total} (` +
    `${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s))`)
  lines.push('')
  lines.push('## Fix plan')
  lines.push('')
  if (report.summary.fixPlan.length === 0) {
    lines.push('No classified failures — nothing to fix from this log.')
  } else {
    report.summary.fixPlan.forEach((f, i) => lines.push(`${i + 1}. ${f}`))
  }
  lines.push('')
  lines.push('## Findings')
  lines.push('')
  for (const f of report.findings) {
    const loc = f.line ? ` — log line ${f.line}` : ''
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id}${loc}`)
    lines.push('')
    lines.push(f.message)
    lines.push('')
    lines.push(`- **Class:** ${f.title} · ${f.kind}`)
    lines.push(`- **Fix:** ${f.fix}`)
    lines.push('')
  }
  if (report.evidence.length > 0) {
    lines.push('## Log evidence (tail)')
    lines.push('')
    lines.push('```')
    lines.push(...report.evidence)
    lines.push('```')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/test-repair/ (gitignored). */
export function writeTestRepairReport(root: string, report: TestRepairReport): { jsonPath: string; mdPath: string } {
  const dir = testRepairDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderTestRepairMarkdown(report))
  return { jsonPath, mdPath }
}
