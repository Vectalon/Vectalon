/**
 * vectalon build-fix — Build Fix Agent (Roadmap Phase 8, item 064)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Diagnoses a failing Metro, Gradle, or Xcode build from its log: the log
 * kind is auto-detected from content (or forced via --metro/--gradle/
 * --xcode), the matching classifier runs (Metro bundler failures from this
 * module, Gradle (013) and Xcode (014) from projectDiagnostics), and every
 * classified failure gets its standard fix — the root cause first, then
 * corroborating symptoms. Pure text parsing, hermetic-testable, no builds
 * are re-run. Reports to docs/vectalon/build-fix/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { analyzeGradleLog } from '../projectDiagnostics/gradle'
import { analyzeXcodeLog } from '../projectDiagnostics/xcode'
import { analyzeMetroLog } from './metro'
import type { LogAnalysis } from '../projectDiagnostics/types'
import type { BuildFixFinding, BuildFixOptions, BuildFixReport, BuildFixSummary, BuildFixVerdict, BuildKind } from './types'

export type { BuildFixFinding, BuildFixOptions, BuildFixReport, BuildFixSummary, BuildFixVerdict, BuildKind } from './types'

/** Where build-fix reports are written (mirrors other docs/vectalon/* dirs). */
export const buildFixDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'build-fix')

/** Strong, unambiguous signals per build system, checked in this order. */
export function detectBuildKind(log: string): BuildKind | 'unknown' {
  const s = log
  if (/(Unable to resolve module|Could not resolve module|TransformError|error: bundling failed|jest-haste-map|Metro has encountered an error|Invalid asset name|--reset-cache|port \d+ is already in use|JavaScript heap out of memory)/i.test(s)) return 'metro'
  if (/(FAILURE: Build failed with an exception|What went wrong:|Execution failed for task|BUILD FAILED)/i.test(s)) return 'gradle'
  if (/(xcodebuild|error: The sandbox is not in sync|clang: error|CocoaPods could not find|Signing for .* requires a development team|Undefined symbols)/i.test(s)) return 'xcode'
  // No decisive signal — whichever classifier matches the most lines wins.
  const counts: Record<BuildKind, number> = {
    metro: analyzeMetroLog(log).matches.length,
    gradle: analyzeGradleLog(log).matches.length,
    xcode: analyzeXcodeLog(log).matches.length,
  }
  const best = (Object.keys(counts) as BuildKind[]).sort((a, b) => counts[b] - counts[a])[0]
  return counts[best] > 0 ? best : 'unknown'
}

function analyzeByKind(log: string, kind: BuildKind): LogAnalysis {
  switch (kind) {
    case 'metro': return analyzeMetroLog(log)
    case 'gradle': return analyzeGradleLog(log)
    case 'xcode': return analyzeXcodeLog(log)
  }
}

/** The overall verdict: a classified root cause blocks, unmatched needs attention. */
export function verdictOf(findings: BuildFixFinding[]): BuildFixVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

/** Turn one classifier pass into findings: root cause error + symptoms. */
export function findingsFromAnalysis(kind: BuildKind, analysis: LogAnalysis): BuildFixFinding[] {
  const findings: BuildFixFinding[] = []
  if (!analysis.rootCause) {
    findings.push({
      id: 'unmatched',
      kind,
      severity: 'warning',
      line: null,
      title: 'No known failure pattern matched',
      message: 'The log did not match a known Metro/Gradle/Xcode error class.',
      fix: 'Re-run the build with more verbosity (--stacktrace for Gradle, -verbose for xcodebuild) and share the failing block — then check the version matrix in the RN upgrade guide for your release.',
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

/** Run one build-fix diagnosis pass. */
export function runBuildFix(root: string, options: BuildFixOptions = {}): BuildFixReport {
  const scannedAt = Date.now()
  if (!options.log) {
    return {
      scannedAt,
      root,
      kind: 'unknown',
      detection: 'none',
      evidence: [],
      findings: [],
      summary: summarizeBuildFix([]),
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
    reportError(err, 'build-fix: reading log')
    return {
      scannedAt,
      root,
      logPath: options.log,
      kind: 'unknown',
      detection: 'none',
      evidence: [],
      findings: [],
      summary: summarizeBuildFix([]),
      verdict: 'approved',
    }
  }

  const kind = options.kind ?? detectBuildKind(log)
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
    summary: summarizeBuildFix(findings),
    verdict: verdictOf(findings),
  }
}

/** Roll findings into counts + the fix plan (root cause first). */
export function summarizeBuildFix(findings: BuildFixFinding[]): BuildFixSummary {
  const byKind: BuildFixSummary['byKind'] = { metro: 0, gradle: 0, xcode: 0 }
  const bySeverity: BuildFixSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
  }
  const fixPlan = findings.map(f => `${f.title}: ${f.fix}`)
  return { total: findings.length, byKind, bySeverity, fixPlan }
}

/** Human-readable markdown report (mirrors diagnostics renderers). */
export function renderBuildFixMarkdown(report: BuildFixReport): string {
  const lines: string[] = []
  lines.push('# vectalon build-fix — Build Fix Diagnosis')
  lines.push('')
  if (report.detection === 'none') {
    lines.push('No build log provided — pass `--log <path>` (or `--metro`/`--gradle`/`--xcode` to force the kind).')
    return lines.join('\n')
  }
  lines.push(`- Build system: **${report.kind}** (${report.detection === 'forced' ? 'forced' : 'auto-detected'})`)
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

/** Write report.json + report.md into docs/vectalon/build-fix/ (gitignored). */
export function writeBuildFixReport(root: string, report: BuildFixReport): { jsonPath: string; mdPath: string } {
  const dir = buildFixDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderBuildFixMarkdown(report))
  return { jsonPath, mdPath }
}
