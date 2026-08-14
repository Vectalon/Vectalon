/**
 * Project Diagnostics (Roadmap Phase 2, items 011-015) — Metro config, Hermes
 * compatibility, Android (Gradle) build analysis, iOS (Xcode) build analysis,
 * and dependency conflict detection in one deterministic pass. Gradle/Xcode
 * log files are parsed with the pattern databases for root-cause + fixes.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { detectWorkspace } from '../harness'
import type { DiagnosticCheck, DiagnosticReport } from './types'
import { metroChecks } from './metro'
import { hermesChecks } from './hermes'
import { gradleProjectChecks, analyzeGradleLogFile } from './gradle'
import { iosProjectChecks, analyzeXcodeLogFile } from './xcode'
import { dependencyConflictChecks } from './deps'

/** Where diagnostics reports are written (mirrors other docs/vectalon/* dirs). */
export const diagnosticsDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'diagnostics')

export interface DiagnosticsOptions {
  /** Optional Gradle build log to analyze (roadmap 013). */
  gradleLog?: string
  /** Optional Xcode build log to analyze (roadmap 014). */
  xcodeLog?: string
}

/** Run every diagnostic category against a project root. */
export function runProjectDiagnostics(root: string, options: DiagnosticsOptions = {}): DiagnosticReport {
  const started = Date.now()
  const checks: DiagnosticCheck[] = []

  // Workspace-aware: when the root is a monorepo, scan each member package
  // root so diagnostics cover the whole repo (like `intel`). The workspace
  // root itself is only scanned when it is a real RN project (declares
  // react-native), which avoids noise on bare monorepo roots.
  const ws = detectWorkspace(root)
  const isRnRoot = (dir: string): boolean => {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      return deps['react-native'] !== undefined
    } catch {
      return false
    }
  }
  const roots: string[] = []
  if (!ws.isMonorepo) {
    roots.push(root)
  } else {
    if (isRnRoot(root)) roots.push(root)
    roots.push(...ws.packages)
  }
  const seen = new Set<string>()
  // Metro configs often sit at the workspace root (shared resolver/watch
  // folders), so always scan the root for Metro — members for everything else.
  if (existsSync(join(root, 'metro.config.js')) || existsSync(join(root, 'metro.config.cjs'))) {
    checks.push(...metroChecks(root))
  }
  for (const r of roots) {
    if (seen.has(r)) continue
    seen.add(r)
    checks.push(...metroChecks(r))
    checks.push(...hermesChecks(r))
    checks.push(...gradleProjectChecks(r))
    checks.push(...iosProjectChecks(r))
    checks.push(...dependencyConflictChecks(r))
  }

  // Log-file analysis (013/014 acceptance: interpret real build failures).
  if (options.gradleLog && existsSync(options.gradleLog)) {
    const analysis = analyzeGradleLogFile(options.gradleLog)
    if (analysis?.rootCause) {
      checks.push({
        id: 'gradle-log-root-cause',
        title: 'Gradle build failure (log)',
        category: 'android',
        status: 'fail',
        detail: `Root cause: ${analysis.rootCause.name}`,
        fix: analysis.rootCause.fix,
      })
    } else if (analysis) {
      checks.push({
        id: 'gradle-log-unmatched',
        title: 'Gradle build failure (log)',
        category: 'android',
        status: 'warn',
        detail: 'No known Gradle error pattern matched the log — reviewed the last 25 lines.',
        fix: 'Re-run the build with `--stacktrace` and paste the failure block into the issue; check the SDK/AGP/Java versions against the RN upgrade guide.',
      })
    }
  }
  if (options.xcodeLog && existsSync(options.xcodeLog)) {
    const analysis = analyzeXcodeLogFile(options.xcodeLog)
    if (analysis?.rootCause) {
      checks.push({
        id: 'xcode-log-root-cause',
        title: 'Xcode build failure (log)',
        category: 'ios',
        status: 'fail',
        detail: `Root cause: ${analysis.rootCause.name}`,
        fix: analysis.rootCause.fix,
      })
    } else if (analysis) {
      checks.push({
        id: 'xcode-log-unmatched',
        title: 'Xcode build failure (log)',
        category: 'ios',
        status: 'warn',
        detail: 'No known Xcode error pattern matched the log — reviewed the last 25 lines.',
        fix: 'Run `xcodebuild` with `-verbose` and share the failing block; check signing, deployment target, and pod installation.',
      })
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root,
    durationMs: Date.now() - started,
    checks,
  }
}

/** Render the report as readable markdown (CLI default output). */
export function renderDiagnosticsMarkdown(report: DiagnosticReport): string {
  const lines: string[] = [
    `# Project Diagnostics`,
    '',
    `**root:** \`${report.root}\``,
    `**generated:** ${report.generatedAt} · **${report.durationMs}ms**`,
    '',
  ]
  const categories: Array<DiagnosticCheck['category']> = ['metro', 'hermes', 'android', 'ios', 'deps']
  const labels: Record<DiagnosticCheck['category'], string> = {
    metro: 'Metro (011)',
    hermes: 'Hermes (012)',
    android: 'Android build (013)',
    ios: 'iOS build (014)',
    deps: 'Dependency conflicts (015)',
  }
  const icon: Record<DiagnosticCheck['status'], string> = { pass: '✓', warn: '⚠', fail: '✗', info: 'ℹ' }
  let pass = 0
  let warn = 0
  let fail = 0
  let info = 0
  for (const check of report.checks) {
    if (check.status === 'pass') pass++
    else if (check.status === 'warn') warn++
    else if (check.status === 'fail') fail++
    else info++
  }
  lines.push(`**${pass} pass · ${warn} warn · ${fail} fail · ${info} info**`, '')

  for (const cat of categories) {
    const catChecks = report.checks.filter(c => c.category === cat)
    if (catChecks.length === 0) continue
    lines.push(`## ${labels[cat]}`, '')
    for (const check of catChecks) {
      lines.push(`- ${icon[check.status]} **${check.title}** — ${check.detail}`)
      if (check.fix) lines.push(`  - Fix: ${check.fix}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Summarize the report to compact per-category status lines. */
export function summarizeDiagnostics(report: DiagnosticReport): string[] {
  const byCategory = new Map<DiagnosticCheck['category'], DiagnosticCheck[]>()
  for (const check of report.checks) {
    const list = byCategory.get(check.category) || []
    list.push(check)
    byCategory.set(check.category, list)
  }
  const out: string[] = []
  for (const [cat, checks] of byCategory) {
    const pass = checks.filter(c => c.status === 'pass').length
    const warn = checks.filter(c => c.status === 'warn').length
    const fail = checks.filter(c => c.status === 'fail').length
    const info = checks.filter(c => c.status === 'info').length
    out.push(`${cat}: ${pass} pass, ${warn} warn, ${fail} fail, ${info} info`)
  }
  return out
}

/** Write report.json + report.md to docs/vectalon/diagnostics and return paths. */
export function writeDiagnosticsReport(root: string, report: DiagnosticReport): { jsonPath: string; mdPath: string } {
  const dir = diagnosticsDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderDiagnosticsMarkdown(report) + '\n')
  return { jsonPath, mdPath }
}
