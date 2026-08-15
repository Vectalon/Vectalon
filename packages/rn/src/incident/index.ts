/**
 * vectalon incident — Incident Commander Agent (Roadmap Phase 11, item 097)
 * Business Source License 1.1 (BSL-1.1)
 *
 * From a crash log (--log) or the latest crash report, composes an
 * incident brief: root cause, hot files with their recent commits (git
 * blame-lite), current release risk, and next steps. Reports to
 * docs/vectalon/incident/ (gitignored).
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { runCrashAnalysis } from '../crash'
import { runReleasePredict } from '../releasePredict'
import type { IncidentHotFile, IncidentReport, IncidentVerdict } from './types'

export type { IncidentHotFile, IncidentReport, IncidentVerdict } from './types'

/** Where incident reports are written. */
export const incidentDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'incident')

/** Recent commits touching a file (degrades to [] outside git). */
export function recentCommitsForFile(root: string, file: string, limit = 3): string[] {
  try {
    const out = execFileSync('git', ['log', '--oneline', '-n', String(limit), '--', file], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).toString()
    return out.split('\n').map(l => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** Extract a relative source path from a crash frame string. */
export function frameToPath(frame: string, root: string): string | null {
  const m = frame.match(/(?:^|\s)(?:file:\/\/)?(\/?(?:src|app|lib|packages)\/[^\s:)]+(?:\.tsx?|\.jsx?|\.js|\.swift|\.m|\.mm|\.java|\.kt))/) ?? frame.match(/(?:^|\s)([A-Za-z0-9_./-]+\.(?:tsx?|jsx?|js|swift|m|mm|java|kt))/)
  if (!m) return null
  const p = m[1]
  if (!p.startsWith('/') && !p.startsWith(root)) {
    const candidate = join(root, p)
    return existsSync(candidate) ? p : null
  }
  const rel = p.startsWith(root) ? p.slice(root.length + 1) : p.replace(/^\/+/, '')
  return existsSync(join(root, rel)) ? rel : null
}

/** Run one incident brief from a crash log. */
export function runIncident(root: string, options: { log?: string } = {}): IncidentReport {
  const scannedAt = Date.now()

  let crashLog: string | null = null
  let source = 'none'
  if (options.log) {
    try {
      crashLog = readFileSync(options.log, 'utf-8')
      source = options.log
    } catch {
      source = `(unreadable: ${options.log})`
    }
  }
  if (crashLog === null) {
    const latest = join(root, 'docs', 'vectalon', 'crash', 'report.json')
    try {
      const prev = JSON.parse(readFileSync(latest, 'utf-8')) as { source?: string }
      source = prev.source ?? 'latest crash report'
      crashLog = `reuse: ${JSON.stringify(prev)}`
    } catch {
      crashLog = null
    }
  }

  if (crashLog === null) {
    return {
      scannedAt, root, source, platform: 'unknown', rootCause: 'no-data',
      probableCause: 'No crash log or prior crash report available.',
      severity: 'warning', hotFiles: [], releaseRisk: null,
      nextSteps: ['Run vectalon crash --log <path> with the crash log, or run vectalon crash first so an incident can reuse its report.'],
      verdict: 'changes-requested',
    }
  }

  // Reuse the crash analyzer; the "reuse:" prefix only tells us to parse the stored report shape.
  const report = crashLog.startsWith('reuse: ')
    ? (JSON.parse(crashLog.slice(7)) as ReturnType<typeof runCrashAnalysis>)
    : runCrashAnalysis(crashLog)

  const hotFiles: IncidentHotFile[] = []
  for (const frame of report.topFrames) {
    const path = frameToPath(frame, root)
    if (path) {
      const existing = hotFiles.find(h => h.file === path)
      if (existing) continue
      hotFiles.push({ file: path, recentCommits: recentCommitsForFile(root, path) })
      if (hotFiles.length >= 5) break
    }
  }

  let releaseRisk: IncidentReport['releaseRisk'] = null
  try {
    const pred = runReleasePredict(root)
    releaseRisk = { score: pred.score, risk: pred.risk }
  } catch {
    releaseRisk = null
  }

  const severity = report.finding.severity
  const nextSteps = [
    report.finding.fix,
    ...report.finding.investigation.slice(0, 3),
    releaseRisk && releaseRisk.score >= 32
      ? `Release risk is ${releaseRisk.risk} (${releaseRisk.score}/100) — hold the release until this incident is resolved.`
      : 'Release risk is within bounds — the incident can be fixed without holding the train.',
  ]
  const verdict: IncidentVerdict = severity === 'error' ? 'changes-requested' : severity === 'warning' ? 'needs-attention' : 'approved'

  return {
    scannedAt,
    root,
    source,
    platform: report.platform,
    exceptionType: report.exceptionType,
    message: report.message,
    rootCause: report.finding.bucket,
    probableCause: report.finding.probableCause,
    severity,
    hotFiles,
    releaseRisk,
    nextSteps,
    verdict,
  }
}

/** Render the incident brief as markdown. */
export function renderIncidentMarkdown(report: IncidentReport): string {
  const lines = ['# vectalon incident — Incident Brief', '']
  lines.push(`Platform: **${report.platform}**  ·  Root cause: **${report.rootCause}**  ·  Verdict: **${report.verdict}**`)
  if (report.exceptionType) lines.push(`Exception: \`${report.exceptionType}\``)
  if (report.message) lines.push(`Message: ${report.message}`)
  lines.push('', '## Root cause', '', report.probableCause, '')
  if (report.releaseRisk) lines.push(`Release risk: **${report.releaseRisk.risk}** (${report.releaseRisk.score}/100)`, '')
  if (report.hotFiles.length > 0) {
    lines.push('', '## Hot files', '')
    for (const h of report.hotFiles) {
      lines.push(`### \`${h.file}\``)
      for (const c of h.recentCommits) lines.push(`- ${c}`)
    }
  }
  lines.push('', '## Next steps', '')
  for (const s of report.nextSteps) lines.push(`- ${s}`)
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeIncidentReport(root: string, report: IncidentReport): { mdPath: string; jsonPath: string } {
  const dir = incidentDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, renderIncidentMarkdown(report), 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  return { mdPath, jsonPath }
}
