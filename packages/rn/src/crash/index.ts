/**
 * vectalon crash — Crash Intelligence Agent (Roadmap Phase 9, item 071)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses iOS / Android / JavaScript crash logs into exception + frames, then
 * reuses the shared RootCauseAnalyzer to bucket the root cause and attaches
 * the standard fix per bucket. Reports to docs/vectalon/crash/ (gitignored).
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { RootCauseAnalyzer } from '../sdlc/RootCauseAnalyzer'
import type { CrashFinding, CrashFrame, CrashOptions, CrashPlatform, CrashReport, ParsedCrashLog } from './types'

export type { CrashFinding, CrashFrame, CrashOptions, CrashPlatform, CrashReport, ParsedCrashLog } from './types'

/** Where crash reports are written. */
export const crashDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'crash')

/** The standard fix for each root-cause bucket RootCauseAnalyzer can emit. */
const STANDARD_FIXES: Record<string, string> = {
  'null-reference': 'Add optional chaining / default values at the nullish access, verify async data loads before render, and align the API response type with the consumer.',
  'module-resolution': 'Fix the import path or install the missing package; check Metro config watchFolders/alias in monorepos.',
  'native-crash': 'Capture the native symbolicated stack; check the OS/runtime version, memory pressure, and third-party native libs — reproduce on the affected device class.',
  'network': 'Harden the request: timeouts, retry with backoff, reachability checks, and error surfaces instead of throwing.',
  'state-mutation': 'Freeze state updates to one flow (useReducer / state machine), make mutations immutable, and add guards for concurrent writes.',
  'resource': 'Close/limit the resource (file, image, listener, subscription) — add lifecycle cleanup and pooling for high-frequency paths.',
  'concurrency': 'Serialize the shared resource with a mutex/queue, avoid shared mutable state across async boundaries.',
  'unknown': 'Reproduce locally, capture logs and the full stack trace, and trace recent changes that could relate.',
}

/** Platform detection from strong log signatures. */
export function detectCrashPlatform(log: string): CrashPlatform {
  if (/Exception Type:\s+\w+|First throw call stack|Termination Reason:|libsystem_kernel/i.test(log)) return 'ios'
  if (/FATAL EXCEPTION|Process:\s+\S+\s+PID|AndroidRuntime|com\.android/i.test(log)) return 'android'
  return 'javascript'
}

/** Extract the exception line (type + message) from the log head. */
function exceptionOf(log: string, platform: CrashPlatform): { type?: string; message?: string } {
  if (platform === 'ios') {
    const uncaught = log.match(/uncaught exception '([^']+)'/)
    const reason = log.match(/reason: '([^']+)'|reason: (.*)$/m)
    const t = log.match(/Exception Type:\s*([^\n]+)/)
    const m2 = log.match(/Exception Message:\s*([^\n]+)/)
    return { type: uncaught?.[1]?.trim() ?? t?.[1]?.trim(), message: reason?.[1]?.trim() ?? m2?.[1]?.trim() }
  }
  if (platform === 'android') {
    const m = log.match(/FATAL EXCEPTION:\s*([^\n]+)/)
    const m2 = log.match(/Process:\s*([^\n]+)/)
    return { type: m?.[1]?.trim() || m2?.[1]?.trim(), message: m2?.[1]?.trim() }
  }
  const m = log.match(/(?:Uncaught|TypeError|ReferenceError|Error|RangeError):?\s*([^\n]+)/)
  return { type: m?.[1]?.split(' at ')[0]?.trim(), message: m?.[1]?.trim() }
}

/** Parse stack frames: iOS ObjC `ClassName method (file:line)`, Android `at pkg.Class.method(File.java:12)`, JS `at fn (file:line:col)`. */
export function parseFrames(log: string, platform: CrashPlatform): CrashFrame[] {
  const frames: CrashFrame[] = []
  const seen = new Set<string>()
  const patterns: { re: RegExp; kind: 'objc' | 'java' | 'js' }[] =
    platform === 'ios'
      ? [{ re: /^\s*\d+\s+\S+\s+(.+?)\s+\(([^)]+)\)/gm, kind: 'objc' }]
      : platform === 'android'
        ? [{ re: /at\s+([\w.$]+)\.([\w<>]+)\(([^:)]+)(?::(\d+))?\)/g, kind: 'java' }]
        : [{ re: /at\s+(\S+)\s+\(([^)]+):(\d+):\d+\)/g, kind: 'js' }]
  for (const { re, kind } of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(log)) !== null) {
      if (kind === 'objc') {
        const fn = m[1]
        const loc = m[2]
        const inApp = loc.includes('node_modules') ? false : /^\/Users\/|\/src\//.test(loc) ? true : undefined
        frames.push({ function: fn, filename: loc, inApp })
      } else if (kind === 'java') {
        frames.push({ function: `${m[1]}.${m[2]}`, filename: m[3], lineno: m[4] ? Number(m[4]) : undefined, inApp: m[1].startsWith('com.') || m[1].startsWith('org.') })
      } else {
        frames.push({ function: m[1], filename: m[2], lineno: Number(m[3]), inApp: !m[2].includes('node_modules') })
      }
      const key = `${m[0]}`
      if (seen.has(key)) break
      seen.add(key)
    }
  }
  return frames.slice(0, 60)
}

/** Parse a full crash log into a structured shape. */
export function parseCrashLog(log: string, platform?: CrashPlatform): ParsedCrashLog {
  const detected = platform ?? detectCrashPlatform(log)
  const { type, message } = exceptionOf(log, detected)
  const release = log.match(/(?:release|version)[\s:=]+([\w.+-]+)/i)?.[1]
  return { platform: detected, exceptionType: type, message, release, frames: parseFrames(log, detected) }
}

export function verdictOf(finding: CrashFinding): CrashReport['verdict'] {
  if (finding.severity === 'error') return 'changes-requested'
  if (finding.severity === 'warning') return 'needs-attention'
  return 'approved'
}

/** Run one crash classification. */
export function runCrashAnalysis(log: string, options: CrashOptions = {}): CrashReport {
  const parsedAt = Date.now()
  const parsed = parseCrashLog(log, options.platform)
  const analyzer = new RootCauseAnalyzer()
  const crash = {
    kind: 'crash' as const,
    id: 'crash-report',
    source: 'sentry' as const,
    platform: parsed.platform,
    release: parsed.release,
    exceptionType: parsed.exceptionType,
    message: parsed.message,
    frames: parsed.frames,
  }
  const root = analyzer.analyzeCrash(crash)
  const inApp = parsed.frames.filter(f => f.inApp !== false).slice(0, 5)
  const topFrames = (inApp.length > 0 ? inApp : parsed.frames).map(f =>
    [f.function || '(anonymous)', [f.filename, f.lineno !== undefined ? `:${f.lineno}` : ''].join('')].filter(Boolean).join(' — ')
  )
  const severity: CrashFinding['severity'] = root.bucket === 'unknown' ? 'warning' : 'error'
  const finding: CrashFinding = {
    bucket: root.bucket,
    probableCause: root.probableCause,
    severity,
    fix: STANDARD_FIXES[root.bucket] ?? STANDARD_FIXES.unknown,
    investigation: root.investigation,
  }
  return {
    parsedAt,
    platform: parsed.platform,
    source: 'log',
    exceptionType: parsed.exceptionType,
    message: parsed.message,
    release: parsed.release,
    topFrames,
    finding,
    verdict: verdictOf(finding),
  }
}

/** Render the classification as markdown. */
export function renderCrashMarkdown(report: CrashReport): string {
  const lines = ['# vectalon crash — Crash Intelligence', '']
  lines.push(`Platform: **${report.platform}**  ·  Verdict: **${report.verdict}**`)
  if (report.exceptionType) lines.push(`Exception: \`${report.exceptionType}\``)
  if (report.message) lines.push(`Message: ${report.message}`)
  if (report.release) lines.push(`Release: ${report.release}`)
  lines.push('', `## Root cause: ${report.finding.bucket}`, '')
  lines.push(report.finding.probableCause, '', `### Standard fix`, '', report.finding.fix, '')
  lines.push('## Investigation steps', '')
  for (const s of report.finding.investigation) lines.push(`- ${s}`)
  lines.push('', '## Top frames', '')
  for (const f of report.topFrames) lines.push(`- \`${f}\``)
  return lines.join('\n')
}

/** Write the markdown + JSON report. */
export function writeCrashReport(root: string, report: CrashReport): { mdPath: string; jsonPath: string } {
  const dir = crashDocsDir(root)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const md = renderCrashMarkdown(report)
  const json = JSON.stringify(report, null, 2)
  const mdPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, json, 'utf-8')
  return { mdPath, jsonPath }
}
