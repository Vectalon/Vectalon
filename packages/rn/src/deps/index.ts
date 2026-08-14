/**
 * vectalon deps — Dependency Upgrade Agent (Roadmap Phase 8, item 067)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass over a project's dependencies that finds what to
 * upgrade and the safe path: RN ecosystem pairing violations against the
 * curated matrix (013/015 machinery), duplicate versions across monorepo
 * members, and vulnerable dependencies via best-effort `npm audit` (critical
 * → error, high → warning) with `npm audit fix` guidance. The audit degrades
 * to a skip when it cannot run; the pairing/duplicate checks are pure file
 * reads. Reports to docs/vectalon/deps/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { ECOSYSTEM_MATRIX } from '../projectDiagnostics/deps'
import { detectWorkspace } from '../harness'
import { runNpmAudit } from '../security/audit'
import type { DepCategory, DepFinding, DepOptions, DepReport, DepSummary, DepVerdict } from './types'

export type { DepFinding, DepOptions, DepReport, DepSummary, DepSeverity, DepCategory, DepVerdict } from './types'

/** Where deps reports are written (mirrors other docs/vectalon/* dirs). */
export const depsDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'deps')

export function verdictOf(findings: DepFinding[]): DepVerdict {
  if (findings.some(f => f.severity === 'error')) return 'changes-requested'
  if (findings.some(f => f.severity === 'warning')) return 'needs-attention'
  return 'approved'
}

function severityRank(sev: DepFinding['severity']): number {
  return sev === 'error' ? 3 : sev === 'warning' ? 2 : 1
}

function parseMajor(version: string): number | null {
  const m = version.match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * RN's meaningful major is the minor segment (0.80.0 → 80), because the
 * semver major is pinned at 0 for every release.
 */
function rnEffectiveMajor(version: string): number | null {
  const m = version.match(/^0\.(\d+)/)
  return m ? Number(m[1]) : parseMajor(version)
}

/** Extract the bare version (1.2.3) from a semver range. */
function versionOf(range: string): string | null {
  const m = range.match(/(\d+\.\d+\.\d+|\d+\.\d+|\d+)/)
  return m ? m[1] : null
}

/** RN pairing + manifest checks (reuses the curated ecosystem matrix). */
function pairingFindings(root: string): { findings: DepFinding[]; depCount: number; rnVersion: string | null } {
  const findings: DepFinding[] = []
  let pkg: Record<string, unknown> = {}
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    findings.push({
      id: 'manifest-missing', category: 'manifest', severity: 'warning', package: '', current: '',
      message: 'No readable package.json at the project root.',
      suggestion: 'Create package.json and declare the project dependencies before upgrading anything.',
    })
    return { findings, depCount: 0, rnVersion: null }
  }
  const deps = { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) } as Record<string, string>
  const depCount = Object.keys(deps).length
  const rnVersion = deps['react-native'] ? versionOf(deps['react-native']) : null

  if (!rnVersion) {
    findings.push({
      id: 'not-rn-project', category: 'manifest', severity: 'info', package: 'react-native', current: '',
      message: 'react-native is not a declared dependency.',
      suggestion: 'This upgrade scan is built for RN projects — install react-native (or skip deps for this project).',
    })
    return { findings, depCount, rnVersion: null }
  }

  // Reuse the curated matrix only where its version semantics are sound for
  // RN's 0.x.y scheme: the react-pairing rule keys off the 0.7x prefixes. The
  // hermes/new-arch rules parse the semver major (0 for every RN release) and
  // would fire on every modern project — that signal lives in diagnostics.
  const reactPairingRule = ECOSYSTEM_MATRIX.find(r => r.id === 'react-native-react')
  if (reactPairingRule) {
    const violation = reactPairingRule.check(rnVersion)
    if (violation !== null) {
      findings.push({
        id: reactPairingRule.id, category: 'pairing', severity: 'warning', package: 'react-native', current: rnVersion,
        message: violation,
        suggestion: reactPairingRule.fix,
      })
    }
  }

  // RN's meaningful major is the minor segment: 0.80.0 → 80.
  const rnMajor = rnEffectiveMajor(rnVersion)
  const reactVersion = deps['react'] ? versionOf(deps['react']) : null
  if (reactVersion) {
    const reactMajor = parseMajor(reactVersion)
    if (rnMajor !== null && reactMajor !== null && rnMajor >= 76 && reactMajor < 18) {
      findings.push({
        id: 'react-floor', category: 'pairing', severity: 'error', package: 'react', current: reactVersion,
        message: `RN ${rnVersion} requires react 18+, found react ${reactVersion}.`,
        suggestion: 'Upgrade react 18.3.x in one step (or react 19 for RN 0.80+), then run the typecheck — react minor bumps are low-risk.',
      })
    }
  }

  const expoVersion = deps['expo'] ? versionOf(deps['expo']) : null
  if (expoVersion) {
    const expoMajor = parseMajor(expoVersion)
    if (expoMajor !== null && rnMajor !== null) {
      const expectedRn = expoMajor >= 54 ? 81 : expoMajor >= 53 ? 79 : expoMajor >= 52 ? 76 : null
      if (expectedRn !== null && rnMajor !== expectedRn) {
        findings.push({
          id: 'expo-rn-alignment', category: 'pairing', severity: 'warning', package: 'expo', current: expoVersion,
          message: `Expo SDK ${expoMajor} expects react-native ~0.${expectedRn}, found 0.${rnMajor}.`,
          suggestion: 'Run `npx expo install react-native react` to align to the SDK-pinned versions — mixing SDK majors with an unaligned RN breaks native builds.',
        })
      }
    }
  }

  // Duplicate versions across monorepo members.
  const ws = detectWorkspace(root)
  if (ws.isMonorepo && ws.packages.length > 0) {
    const byName = new Map<string, Map<string, string[]>>()
    for (const member of ws.packages) {
      try {
        const memberPkg = JSON.parse(readFileSync(join(member, 'package.json'), 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; name?: string }
        const all = { ...memberPkg.dependencies, ...memberPkg.devDependencies } as Record<string, string>
        for (const [name, range] of Object.entries(all)) {
          const byRange = byName.get(name) || new Map<string, string[]>()
          const holders = byRange.get(range) || []
          holders.push(memberPkg.name || member)
          byRange.set(range, holders)
          byName.set(name, byRange)
        }
      } catch { /* skip unreadable member */ }
    }
    for (const [name, byRange] of byName) {
      if (byRange.size > 1) {
        const ranges = [...byRange.keys()]
        findings.push({
          id: `duplicate-${name.replace(/[^a-z0-9-]/gi, '-')}`, category: 'duplicates', severity: 'warning', package: name, current: ranges.join(' vs '),
          message: `${[...byRange.values()].flat().join(', ')} declare different versions of ${name} (${ranges.join(' vs ')}).`,
          suggestion: 'Align to one version at the workspace root (or one catalog) so native builds resolve a single copy — upgrade the older holders to the newest range.',
        })
      }
    }
  }

  return { findings, depCount, rnVersion }
}

function auditSeverity(sev: string): DepFinding['severity'] {
  return sev === 'critical' ? 'error' : sev === 'high' ? 'warning' : 'info'
}

/** Roll findings into counts + top upgrade paths. */
export function summarizeDeps(findings: DepFinding[]): DepSummary {
  const bySeverity: DepSummary['bySeverity'] = { error: 0, warning: 0, info: 0 }
  const byCategory: DepSummary['byCategory'] = { pairing: 0, duplicates: 0, vulnerability: 0, manifest: 0 }
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1
  }
  const ranked = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const seen = new Set<string>()
  const topRecommendations: string[] = []
  for (const f of ranked) {
    const key = `${f.id}:${f.package}`
    if (seen.has(key)) continue
    seen.add(key)
    topRecommendations.push(`${f.message} — ${f.suggestion}`)
    if (topRecommendations.length >= 3) break
  }
  return { total: findings.length, bySeverity, byCategory, topRecommendations }
}

/** Run one dependency upgrade scan. */
export async function runDepsScan(root: string, options: DepOptions = {}): Promise<DepReport> {
  const scannedAt = Date.now()
  const { findings, depCount, rnVersion } = pairingFindings(root)

  let audit: DepReport['audit'] = { ran: false, skippedReason: 'skipped via --no-audit', total: 0, critical: 0, high: 0 }
  if (!options.skipAudit) {
    const result = options.auditRunner
      ? await options.auditRunner(root)
      : await runNpmAudit(root, options.auditTimeoutMs ?? 90000)
    if (result) {
      audit = { ran: result.ran, skippedReason: result.skippedReason, total: result.total, critical: result.critical, high: result.high }
      if (result.ran) {
        for (const v of result.vulnerabilities) {
          if (v.severity === 'low' || v.severity === 'moderate' || v.severity === 'info') continue
          findings.push({
            id: 'vulnerability', category: 'vulnerability', severity: auditSeverity(v.severity), package: v.package, current: 'declared range',
            message: `${v.package} has a ${v.severity} advisory${v.isDirect ? '' : ' (transitive)'}.`,
            suggestion: `Run npm audit fix${v.isDirect ? '' : ' and upgrade the direct dependency that pulls it in'} — then re-run this scan to confirm the tree is clean.`,
          })
        }
      }
    }
  }

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  return {
    scannedAt,
    root,
    depCount,
    audit,
    findings,
    summary: summarizeDeps(findings),
    verdict: verdictOf(findings),
  }
}

/** Human-readable markdown report. */
export function renderDepsMarkdown(report: DepReport): string {
  const lines: string[] = []
  lines.push('# vectalon deps — Dependency Upgrade Plan')
  lines.push('')
  lines.push(`- Verdict: **${report.verdict}**`)
  lines.push(`- ${report.depCount} direct dependencies in ${report.root}`)
  lines.push(`- Findings: ${report.summary.total} (` +
    `${report.summary.bySeverity.error} error(s), ${report.summary.bySeverity.warning} warning(s), ${report.summary.bySeverity.info} info)`)
  lines.push('')
  lines.push('## Dependency audit')
  lines.push('')
  if (!report.audit.ran) {
    lines.push(`Audit skipped — ${report.audit.skippedReason ?? 'not run'}.`)
  } else {
    lines.push(`- ${report.audit.total} advisory(ies): ${report.audit.critical} critical, ${report.audit.high} high`)
  }
  lines.push('')
  if (report.summary.topRecommendations.length > 0) {
    lines.push('## Top upgrade paths')
    lines.push('')
    report.summary.topRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    lines.push('')
  }
  lines.push('## Findings')
  lines.push('')
  if (report.findings.length === 0) {
    lines.push('No dependency issues found — the tree is aligned and clean.')
  }
  for (const f of report.findings) {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.id} — ${f.package} (${f.current})`)
    lines.push('')
    lines.push(f.message)
    lines.push('')
    lines.push(`- **Category:** ${f.category}`)
    lines.push(`- **Upgrade path:** ${f.suggestion}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/deps/ (gitignored). */
export function writeDepsReport(root: string, report: DepReport): { jsonPath: string; mdPath: string } {
  const dir = depsDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderDepsMarkdown(report))
  return { jsonPath, mdPath }
}
