/**
 * vc score — Vectalon Engineering Health Score.
 * Business Source License 1.1 (BSL-1.1)
 *
 * One command, one number an engineering manager immediately understands:
 * overall 0-100, aggregated from eight deterministic dimensions, each scored
 * by a committed scanner consuming the shared Project Intelligence model:
 *
 *   Architecture   ← arch-score (cycles, layering, coupling, module size,
 *                    testability, nesting)
 *   Dependencies   ← deps scan (pairing, duplicates) + dep-graph cycles
 *   Build Health   ← fix's native-config reads vs the RN-required table
 *                    (compileSdk / Kotlin / AGP / Gradle wrapper)
 *   Testing        ← test-file ratio + jest presence
 *   Performance    ← perf-scan (render/startup/bridge hazards)
 *   Security       ← security scan (secrets, unsafe patterns, audit)
 *   Accessibility  ← a11y scan
 *   RN Upgrade Risk← upgrade impact vs LATEST_KNOWN_RN
 *
 * The previous run is persisted to docs/vectalon/score/history.json, so the
 * report carries the delta ("↓ 8 points this week") and the newly-arrived
 * problems. Every finding becomes a P0/P1/P2 recommended action.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import type { Dirent } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { readProjectIntel } from '../intel/model'
import { scoreArchitecture } from '../archScore'
import { runDepsScan } from '../deps'
import { readProjectContext, requirementsForRn } from '../fix/diagnose'
import { runPerfScan } from '../perfScan'
import { runSecurityReview } from '../security'
import { runA11yScan } from '../a11y'
import { detectVersions } from '../upgrade/detect'
import { analyzeUpgradeImpact } from '../upgrade/impact'
import { LATEST_KNOWN_RN } from '../upgrade/catalog'
import type { ScoreDimension, ScoreFinding, ScoreHistory, ScoreHistoryEntry, ScoreOptions, ScorePriority, ScoreRecommendation, ScoreReport, ScoreVerdict } from './types'

export type { ScoreDimension, ScoreFinding, ScoreHistory, ScoreHistoryEntry, ScoreOptions, ScorePriority, ScoreRecommendation, ScoreReport, ScoreVerdict } from './types'

/** Where vc score reports are written (mirrors other docs/vectalon/* dirs). */
export const scoreDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'score')

/** History file: previous runs, for the delta + new-problems diff. */
export const historyPath = (root: string): string => join(scoreDocsDir(root), 'history.json')

/** A stable key for one finding (dimension:id:file). */
export function findingKey(f: ScoreFinding): string {
  return `${f.dimension}:${f.id}:${f.file}`
}

/** Severity → priority for the recommended actions. */
export function priorityOf(severity: ScoreFinding['severity']): ScorePriority {
  if (severity === 'error') return 'P0'
  if (severity === 'warning') return 'P1'
  return 'P2'
}

function gradeOf(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function verdictOf(score: number): ScoreVerdict {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

/** Penalty model shared by the finding-driven dimensions. */
function scoreFromFindings(findings: ScoreFinding[]): number {
  let score = 100
  for (const f of findings) {
    if (f.severity === 'error') score -= 25
    else if (f.severity === 'warning') score -= 10
    else score -= 3
  }
  return Math.max(0, Math.round(score))
}

/** Ignored dirs for the lightweight source/test walk. */
const IGNORE_DIRS = new Set(['node_modules', '.git', 'docs', 'android', 'ios', 'build', 'dist', '.expo', '.vectalon', 'coverage', 'vendor', 'Pods'])

function walkFiles(root: string, dir: string, out: string[]): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[]
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue
      walkFiles(root, join(dir, e.name), out)
    } else if (e.isFile()) {
      out.push(join(dir, e.name))
    }
  }
}

/** All source files (relative) + test files, excluding vendor/build dirs. */
export function collectSourceAndTests(root: string): { sourceFiles: string[]; testFiles: string[] } {
  const all: string[] = []
  for (const sub of ['src', 'app', 'lib', 'screens', 'components', 'features']) {
    const dir = join(root, sub)
    if (existsSync(dir)) walkFiles(root, dir, all)
  }
  // Fall back to the package root when the conventional dirs are absent.
  if (all.length === 0) {
    const rootEntries: string[] = []
    walkFiles(root, root, rootEntries)
    for (const f of rootEntries) {
      if (f === join(root, 'package.json') || f === join(root, 'tsconfig.json') || f === join(root, 'babel.config.js') || f === join(root, 'metro.config.js')) continue
      all.push(f)
    }
  }
  const testFiles = all.filter(f => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f) || /(^|\/)__tests__\//.test(f))
  const sourceFiles = all.filter(f => /\.(ts|tsx|js|jsx)$/.test(f) && !testFiles.includes(f))
  return { sourceFiles, testFiles }
}

// ---------------------------------------------------------------------------
// The eight dimension scorers. Each returns null when it cannot run — the
// overall is renormalized over the dimensions that scored.
// ---------------------------------------------------------------------------

function scoreArchitectureDim(root: string): ScoreDimension | null {
  let arch
  try {
    arch = scoreArchitecture(root)
  } catch (err) {
    reportError(err, 'vc score: architecture dimension')
    return null
  }
  const findings: ScoreFinding[] = []
  for (const d of arch.dimensions) {
    if (d.id === 'cycles' && d.score < 100) {
      findings.push({
        id: 'arch-cycle', dimension: 'architecture', severity: 'error', file: '',
        message: `Circular dependencies found (${d.detail})`,
        action: 'Break the cycle — extract the shared code into its own module.',
      })
    }
    if (d.id === 'layering' && d.score < 80) {
      findings.push({
        id: 'arch-layering', dimension: 'architecture', severity: 'warning', file: '',
        message: `Layering violations (${d.detail})`,
        action: 'Keep shared code from importing feature code — move the shared piece to a common module.',
      })
    }
  }
  if (arch.total < 80 && findings.length === 0) {
    findings.push({
      id: 'arch-low', dimension: 'architecture', severity: 'warning', file: '',
      message: `Architecture score ${arch.total}/100 (${arch.grade})`,
      action: arch.topImprovements[0] ?? 'Tighten module boundaries and reduce coupling.',
    })
  }
  return {
    id: 'architecture', label: 'Architecture', score: arch.total, weight: 0.15,
    detail: arch.grade === 'A' ? 'Clean module boundaries, no cycles' : `${arch.total}/100 · ${arch.topImprovements[0] ?? 'see report'}`,
    findings,
    evidence: arch.dimensions.map(d => `${d.label}: ${d.score} — ${d.detail}`),
  }
}

async function scoreDependenciesDim(root: string, options: ScoreOptions, cycles: number): Promise<ScoreDimension | null> {
  let deps
  try {
    deps = await runDepsScan(root, { skipAudit: options.skipAudit ?? true, auditRunner: options.auditRunner, auditTimeoutMs: options.auditTimeoutMs })
  } catch (err) {
    reportError(err, 'vc score: dependencies dimension')
    return null
  }
  const findings: ScoreFinding[] = []
  for (const f of deps.findings) {
    findings.push({
      id: `dep-${f.category}`, dimension: 'dependencies', severity: f.severity, file: '',
      message: f.message,
      action: f.suggestion,
    })
  }
  if (cycles > 0) {
    findings.push({
      id: 'dep-cycle', dimension: 'dependencies', severity: 'error', file: '',
      message: `${cycles} circular dependenc${cycles === 1 ? 'y' : 'ies'} in the dependency graph`,
      action: 'Break the cycle at its weakest edge — hoist the shared code into its own package.',
    })
  }
  if (deps.audit.ran && (deps.audit.critical > 0 || deps.audit.high > 0)) {
    findings.push({
      id: 'dep-audit', dimension: 'dependencies', severity: 'error', file: '',
      message: `${deps.audit.critical} critical + ${deps.audit.high} high npm advisories`,
      action: 'Run `npm audit fix` for direct advisories, then upgrade the direct deps pulling transitive ones.',
    })
  }
  return {
    id: 'dependencies', label: 'Dependencies', score: scoreFromFindings(findings), weight: 0.15,
    detail: deps.findings.length === 0 ? `${deps.depCount} direct deps, no problems` : `${deps.findings.length} finding${deps.findings.length === 1 ? '' : 's'} (${deps.summary.bySeverity.error} error, ${deps.summary.bySeverity.warning} warning)`,
    findings,
    evidence: [
      `${deps.depCount} direct dependencies`,
      `Audit: ${deps.audit.ran ? `${deps.audit.total} advisories (${deps.audit.critical} critical, ${deps.audit.high} high)` : 'skipped (offline)'}`,
      ...(cycles > 0 ? [`${cycles} dependency-graph cycle${cycles === 1 ? '' : 's'}`] : []),
    ],
  }
}

function scoreBuildHealthDim(root: string): ScoreDimension | null {
  // The foundation: readProjectContext consumes the shared intel model
  // (manifest deps + native registry) and fills native-config gaps directly.
  const ctx = readProjectContext(root)
  if (!ctx.rnVersion) {
    return {
      id: 'build-health', label: 'Build Health', score: 50, weight: 0.15,
      detail: 'No react-native version detected — native build health not verifiable',
      findings: [{
        id: 'build-unknown', dimension: 'build-health', severity: 'warning', file: 'package.json',
        message: 'react-native is not a declared dependency',
        action: 'Add react-native to dependencies so build health can be verified against the RN-required table.',
      }],
      evidence: ['react-native version: unknown'],
    }
  }
  const req = requirementsForRn(ctx.rnVersion)
  const findings: ScoreFinding[] = []
  const evidence: string[] = [`react-native ${ctx.rnVersion}${req ? ` requires compileSdk ${req.compileSdk} · Kotlin ${req.kotlin} · Gradle ${req.gradle} · AGP ${req.agp}` : ''}`]

  if (req) {
    const checks: Array<[string, string, number | string | null, number | string, string]> = [
      ['compileSdk', 'compileSdkVersion', ctx.compileSdk, req.compileSdk, 'sdk'],
      ['Kotlin', 'kotlinVersion', ctx.kotlinVersion, req.kotlin, 'version'],
      ['Gradle wrapper', 'gradle-wrapper.properties', ctx.gradleVersion, req.gradle, 'version'],
      ['AGP', 'com.android.tools.build:gradle', ctx.agpVersion, req.agp, 'version'],
    ]
    for (const [label, key, current, required, kind] of checks) {
      const cur = typeof current === 'number' ? current : versionOf(current)
      const reqNum = typeof required === 'number' ? required : versionOf(required)
      if (current === null || current === undefined) {
        findings.push({
          id: `build-${key}`, dimension: 'build-health', severity: 'warning', file: 'android/build.gradle',
          message: `${label} not detected — cannot verify against the ${req.compileSdk} SDK requirement`,
          action: `Declare ${label} in android/build.gradle (RN ${ctx.rnVersion} needs ${label} ${required}${kind === 'sdk' ? '' : '+'}).`,
        })
        evidence.push(`${label}: not detected`)
      } else if (typeof cur === 'number' && cur < (reqNum as number)) {
        findings.push({
          id: `build-${key}`, dimension: 'build-health', severity: 'error', file: 'android/build.gradle',
          message: `${label} ${current} is below the ${required} RN ${ctx.rnVersion} requires`,
          action: `Bump ${label} to ${required} in android/build.gradle.`,
        })
        evidence.push(`${label}: ${current} < required ${required}`)
      } else if (cur === null) {
        findings.push({
          id: `build-${key}`, dimension: 'build-health', severity: 'warning', file: 'android/build.gradle',
          message: `${label} ${current} does not satisfy the RN ${ctx.rnVersion} requirement (${required})`,
          action: `Align ${label} to ${required}.`,
        })
        evidence.push(`${label}: ${current} vs required ${required}`)
      } else {
        evidence.push(`${label}: ${current} ✓`)
      }
    }
  } else {
    evidence.push('No RN-required table entry for this version — build health best-effort only')
  }
  return {
    id: 'build-health', label: 'Build Health', score: scoreFromFindings(findings), weight: 0.15,
    detail: findings.length === 0 ? 'Native config aligned with the RN-required versions' : `${findings.length} config mismatch${findings.length === 1 ? '' : 'es'}`,
    findings,
    evidence,
  }
}

function versionOf(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.match(/(\d+)(?:\.(\d+))?/)
  if (!m) return null
  return Number(`${m[1]}.${m[2] ?? '0'}`)
}

function scoreTestingDim(root: string): ScoreDimension {
  const { sourceFiles, testFiles } = collectSourceAndTests(root)
  const ratio = sourceFiles.length > 0 ? testFiles.length / sourceFiles.length : 0
  const findings: ScoreFinding[] = []
  const evidence: string[] = [`${testFiles.length} test files · ${sourceFiles.length} source files (${(ratio * 100).toFixed(0)}% test coverage)`]

  if (sourceFiles.length === 0) {
    return {
      id: 'testing', label: 'Testing', score: 50, weight: 0.13,
      detail: 'No source files found to assess testing coverage',
      findings: [{
        id: 'test-none', dimension: 'testing', severity: 'warning', file: '',
        message: 'No source files detected',
        action: 'Add a src/ or app/ directory with your application code.',
      }],
      evidence,
    }
  }
  if (testFiles.length === 0) {
    findings.push({
      id: 'test-none', dimension: 'testing', severity: 'error', file: '',
      message: 'No test files found',
      action: 'Add jest + react-test-renderer and a first test for your core logic.',
    })
  } else if (ratio < 0.3) {
    findings.push({
      id: 'test-low', dimension: 'testing', severity: 'warning', file: '',
      message: `Only ${testFiles.length} test file${testFiles.length === 1 ? '' : 's'} for ${sourceFiles.length} source files (${(ratio * 100).toFixed(0)}%)`,
      action: 'Add tests for the highest-risk modules first — navigation, state, and business logic.',
    })
  }
  // Jest presence — from the manifest the intel model already read.
  const hasJest = existsSync(join(root, 'package.json')) && /"jest"\s*:/.test(readFileSync(join(root, 'package.json'), 'utf-8'))
  if (!hasJest && testFiles.length > 0) {
    findings.push({
      id: 'test-runner', dimension: 'testing', severity: 'info', file: 'package.json',
      message: 'Test files exist but jest is not a devDependency',
      action: 'Add jest + jest.config.js so `npm test` runs the suite.',
    })
  }
  evidence.push(hasJest ? 'jest: configured' : 'jest: not configured')
  return {
    id: 'testing', label: 'Testing', score: scoreFromFindings(findings), weight: 0.13,
    detail: testFiles.length === 0 ? 'No tests yet' : `${testFiles.length} test file${testFiles.length === 1 ? '' : 's'} for ${sourceFiles.length} source files`,
    findings,
    evidence,
  }
}

function scorePerformanceDim(root: string): ScoreDimension | null {
  let perf
  try {
    perf = runPerfScan(root)
  } catch (err) {
    reportError(err, 'vc score: performance dimension')
    return null
  }
  const findings: ScoreFinding[] = perf.findings.map(f => ({
    id: `perf-${f.category}`, dimension: 'performance', severity: f.severity,
    file: f.file, message: `${f.metric} — ${f.message}`, action: f.suggestion,
  }))
  return {
    id: 'performance', label: 'Performance', score: scoreFromFindings(findings), weight: 0.1,
    detail: findings.length === 0 ? 'No render/startup/bridge hazards found' : `${findings.length} hazard${findings.length === 1 ? '' : 's'} (${perf.summary.bySeverity.error} error, ${perf.summary.bySeverity.warning} warning)`,
    findings,
    evidence: perf.summary.topRecommendations.slice(0, 3),
  }
}

async function scoreSecurityDim(root: string, options: ScoreOptions): Promise<ScoreDimension | null> {
  let sec
  try {
    sec = await runSecurityReview(root, { skipAudit: options.skipAudit ?? true, auditRunner: options.auditRunner, auditTimeoutMs: options.auditTimeoutMs })
  } catch (err) {
    reportError(err, 'vc score: security dimension')
    return null
  }
  const findings: ScoreFinding[] = sec.findings.map(f => ({
    id: `sec-${f.category}`, dimension: 'security', severity: f.severity,
    file: f.file, message: f.message, action: f.suggestion,
  }))
  if (sec.audit.ran && (sec.audit.critical > 0 || sec.audit.high > 0)) {
    findings.push({
      id: 'sec-audit', dimension: 'security', severity: 'error', file: '',
      message: `${sec.audit.critical} critical + ${sec.audit.high} high npm advisories`,
      action: 'Run `npm audit fix` — upgrade direct deps pulling transitive vulnerabilities.',
    })
  }
  return {
    id: 'security', label: 'Security', score: scoreFromFindings(findings), weight: 0.15,
    detail: findings.length === 0 ? 'No secrets or unsafe patterns found' : `${findings.length} finding${findings.length === 1 ? '' : 's'} (${sec.summary.bySeverity.error} error, ${sec.summary.bySeverity.warning} warning)`,
    findings,
    evidence: [`${sec.fileCount} files scanned`, `Audit: ${sec.audit.ran ? `${sec.audit.total} advisories` : 'skipped (offline)'}`],
  }
}

function scoreAccessibilityDim(root: string): ScoreDimension | null {
  let a11y
  try {
    a11y = runA11yScan(root)
  } catch (err) {
    reportError(err, 'vc score: accessibility dimension')
    return null
  }
  const findings: ScoreFinding[] = a11y.findings.map(f => ({
    id: 'a11y', dimension: 'accessibility', severity: f.severity,
    file: f.file, message: f.message, action: f.suggestion,
  }))
  return {
    id: 'accessibility', label: 'Accessibility', score: scoreFromFindings(findings), weight: 0.08,
    detail: findings.length === 0 ? 'No accessibility findings' : `${findings.length} finding${findings.length === 1 ? '' : 's'} (${a11y.summary.bySeverity.error} error, ${a11y.summary.bySeverity.warning} warning)`,
    findings,
    evidence: a11y.summary.topRecommendations.slice(0, 3),
  }
}

function scoreUpgradeRiskDim(root: string): ScoreDimension | null {
  let versions, findings
  try {
    versions = detectVersions(root)
    findings = analyzeUpgradeImpact(versions, LATEST_KNOWN_RN)
  } catch (err) {
    reportError(err, 'vc score: upgrade-risk dimension')
    return null
  }
  const scoreFindings: ScoreFinding[] = []
  const byRisk = { high: 0, medium: 0, low: 0 }
  for (const f of findings) {
    if (f.risk === 'high') byRisk.high++
    else if (f.risk === 'medium') byRisk.medium++
    else byRisk.low++
    scoreFindings.push({
      id: `upgrade-${f.category}`, dimension: 'upgrade-risk', severity: f.risk === 'high' ? 'error' : f.risk === 'medium' ? 'warning' : 'info',
      file: f.file, message: f.detail, action: 'See the upgrade plan for the safe migration path — run `vc upgrade` for the step-by-step migration.',
    })
  }
  let score = 100 - byRisk.high * 20 - byRisk.medium * 8 - byRisk.low * 3
  score = Math.max(0, Math.round(score))
  const majorsBehind = versions.rnVersion ? majorsBehindLatest(versions.rnVersion) : 0
  if (majorsBehind >= 1) {
    scoreFindings.push({
      id: 'upgrade-major', dimension: 'upgrade-risk', severity: majorsBehind >= 2 ? 'error' : 'warning', file: 'package.json',
      message: `react-native ${versions.rnVersion} is ${majorsBehind} major version${majorsBehind === 1 ? '' : 's'} behind ${LATEST_KNOWN_RN}`,
      action: `Plan an upgrade to react-native ${LATEST_KNOWN_RN} — run \`vc upgrade\` for the step-by-step migration.`,
    })
    score -= majorsBehind >= 2 ? 25 : 10
    score = Math.max(0, score)
  }
  return {
    id: 'upgrade-risk', label: 'RN Upgrade Risk', score, weight: 0.09,
    detail: versions.rnVersion ? `react-native ${versions.rnVersion} → ${LATEST_KNOWN_RN} (${majorsBehind} major${majorsBehind === 1 ? '' : 's'} behind)` : 'RN version unknown — risk not assessable',
    findings: scoreFindings,
    evidence: [
      versions.rnVersion ? `react-native ${versions.rnVersion} · latest known ${LATEST_KNOWN_RN}` : 'react-native version: unknown',
      `${byRisk.high} high · ${byRisk.medium} medium · ${byRisk.low} low impact items`,
    ],
  }
}

function majorsBehindLatest(rnVersion: string): number {
  const cur = rnVersion.match(/^(\d+)\.(\d+)/)
  if (!cur) return 0
  const latest = LATEST_KNOWN_RN.match(/^(\d+)\.(\d+)/)
  if (!latest) return 0
  const curMajor = Number(cur[1])
  const latestMajor = Number(latest[1])
  return latestMajor > curMajor ? latestMajor - curMajor : 0
}

// ---------------------------------------------------------------------------
// Aggregation + history + orchestration.
// ---------------------------------------------------------------------------

/** Weighted overall over the dimensions that scored (renormalized). */
export function aggregateOverall(dimensions: ScoreDimension[]): { overall: number; verdict: ScoreVerdict; grade: string } {
  const scored = dimensions
  const weightSum = scored.reduce((acc, d) => acc + d.weight, 0)
  if (weightSum === 0) return { overall: 0, verdict: 'poor', grade: 'F' }
  const overall = Math.round(scored.reduce((acc, d) => acc + d.score * (d.weight / weightSum), 0))
  return { overall, verdict: verdictOf(overall), grade: gradeOf(overall) }
}

/** Collect every finding, dedupe, and rank P0 → P1 → P2 (max 10). */
export function buildRecommendations(dimensions: ScoreDimension[]): ScoreRecommendation[] {
  const seen = new Set<string>()
  const out: ScoreRecommendation[] = []
  for (const d of dimensions) {
    for (const f of d.findings) {
      const key = findingKey(f)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ priority: priorityOf(f.severity), dimension: d.label, message: f.message, action: f.action })
    }
  }
  const rank: Record<ScorePriority, number> = { P0: 0, P1: 1, P2: 2 }
  out.sort((a, b) => rank[a.priority] - rank[b.priority])
  return out.slice(0, 10)
}

export function readHistory(root: string): ScoreHistory {
  try {
    const p = historyPath(root)
    if (!existsSync(p)) return { entries: [] }
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as ScoreHistory
    if (!Array.isArray(parsed.entries)) return { entries: [] }
    return parsed
  } catch (err) {
    reportError(err, 'vc score: reading history')
    return { entries: [] }
  }
}

export function writeHistory(root: string, history: ScoreHistory): void {
  try {
    const dir = scoreDocsDir(root)
    mkdirSync(dir, { recursive: true })
    // Keep only the most recent runs — the delta only needs the last one.
    const capped: ScoreHistory = { entries: history.entries.slice(-12) }
    writeFileSync(historyPath(root), JSON.stringify(capped, null, 2) + '\n')
  } catch (err) {
    reportError(err, 'vc score: writing history')
  }
}

/**
 * Run the full score. Deterministic, offline by default (skipAudit), and
 * always resilient: a dimension whose scanner fails is skipped and the
 * overall renormalizes over the rest.
 */
export async function runScore(root: string, options: ScoreOptions = {}): Promise<ScoreReport> {
  const scoredAt = Date.now()

  // The foundation: one shared intel pass per process (cached).
  const intel = readProjectIntel(root)
  const cycles = intel.report?.dependencyGraph.cycles.length ?? 0

  const dims = await Promise.all([
    Promise.resolve(scoreArchitectureDim(root)),
    scoreDependenciesDim(root, options, cycles),
    Promise.resolve(scoreBuildHealthDim(root)),
    Promise.resolve(scoreTestingDim(root)),
    Promise.resolve(scorePerformanceDim(root)),
    scoreSecurityDim(root, options),
    Promise.resolve(scoreAccessibilityDim(root)),
    Promise.resolve(scoreUpgradeRiskDim(root)),
  ])

  const dimensions = dims.filter((d): d is ScoreDimension => d !== null)
  const { overall, verdict, grade } = aggregateOverall(dimensions)
  const recommendations = buildRecommendations(dimensions)

  // Delta + new problems vs the previous run.
  const history = readHistory(root)
  const prev = history.entries[history.entries.length - 1] ?? null
  const allIds = new Set(dimensions.flatMap(d => d.findings).map(findingKey))
  let delta: number | null = null
  let newProblems: ScoreFinding[] = []
  let historyNote = 'First score — no previous run to compare against'
  if (prev) {
    delta = overall - prev.overall
    const prevIds = new Set(prev.findingIds)
    newProblems = dimensions.flatMap(d => d.findings).filter(f => !prevIds.has(findingKey(f)))
    const when = prev.scoredAt.slice(0, 10)
    historyNote = `vs ${when} (${prev.overall}/100)`
  }

  // Persist this run for the next delta.
  const entry: ScoreHistoryEntry = {
    scoredAt: new Date(scoredAt).toISOString(),
    overall,
    findingIds: [...allIds],
  }
  writeHistory(root, { entries: [...history.entries, entry] })

  return {
    scoredAt,
    root,
    overall,
    grade,
    verdict,
    delta,
    newProblems,
    dimensions,
    recommendations,
    historyNote,
  }
}

/** Human-readable markdown report. */
export function renderScoreMarkdown(report: ScoreReport): string {
  const lines: string[] = []
  lines.push('# vc score — Vectalon Engineering Health Score')
  lines.push('')
  lines.push(`- Overall: **${report.overall}/100 (${report.grade})** · Verdict: **${report.verdict}**`)
  if (report.delta !== null) {
    const arrow = report.delta >= 0 ? '↑' : '↓'
    lines.push(`- Delta: **${arrow} ${Math.abs(report.delta)} points** (${report.historyNote})`)
  } else {
    lines.push(`- ${report.historyNote}`)
  }
  lines.push('')
  lines.push('## Dimensions')
  lines.push('')
  lines.push('| Dimension | Score | Detail |')
  lines.push('|---|---|---|')
  for (const d of report.dimensions) {
    lines.push(`| ${d.label} | ${d.score} | ${d.detail} |`)
  }
  lines.push('')
  if (report.newProblems.length > 0) {
    lines.push(`## New problems (${report.newProblems.length})`)
    lines.push('')
    for (const f of report.newProblems) {
      lines.push(`- **${f.dimension}** — ${f.message}${f.file ? ` (\`${f.file}\`)` : ''}`)
    }
    lines.push('')
  }
  if (report.recommendations.length > 0) {
    lines.push('## Recommended actions')
    lines.push('')
    for (const r of report.recommendations) {
      lines.push(`- **${r.priority}** ${r.dimension}: ${r.message} — ${r.action}`)
    }
  } else {
    lines.push('No recommended actions — nothing blocking.')
  }
  lines.push('')
  lines.push('## Evidence')
  lines.push('')
  for (const d of report.dimensions) {
    lines.push(`### ${d.label}`)
    lines.push('')
    for (const e of d.evidence) lines.push(`- ${e}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Write report.json + report.md into docs/vectalon/score/ (gitignored). */
export function writeScoreReport(root: string, report: ScoreReport): { jsonPath: string; mdPath: string } {
  const dir = scoreDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const mdPath = join(dir, 'report.md')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(mdPath, renderScoreMarkdown(report))
  return { jsonPath, mdPath }
}
