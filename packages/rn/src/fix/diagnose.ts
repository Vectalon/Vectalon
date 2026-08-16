/**
 * vc fix — diagnose: understand the project, its dependency graph, and its
 * native configuration; identify the root cause of the reported issue.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reuses the committed analyzers (gradle/xcode/metro log classifiers from
 * projectDiagnostics + buildFix) and adds deterministic project-side checks:
 * compileSdk / AGP / Gradle / Kotlin against the RN-required versions, plus
 * Kotlin-requirement parsing from the log or issue text. Pure text + fs, no
 * model calls, hermetic-testable.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { analyzeGradleLog } from '../projectDiagnostics/gradle'
import { analyzeXcodeLog } from '../projectDiagnostics/xcode'
import { analyzeMetroLog } from '../buildFix/metro'
import { detectBuildKind } from '../buildFix'
import type { LogAnalysis } from '../projectDiagnostics/types'
import type { FixEvidence, FixFinding, FixOptions, FixSeverity } from './types'

export type FixKind = 'gradle' | 'xcode' | 'metro' | 'deps' | 'general'

export interface ProjectContext {
  flavor: 'expo' | 'rn-cli' | 'unknown'
  rnVersion: number | null
  expoVersion: number | null
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /** Native modules (deps whose package is a native RN/Expo module). */
  nativeModules: string[]
  compileSdk: number | null
  kotlinVersion: string | null
  agpVersion: string | null
  gradleVersion: string | null
  jvmArgs: string | null
}

/** RN template pins (deterministic knowledge, from the RN upgrade guide). */
export interface RnRequirements {
  compileSdk: number
  kotlin: string
  gradle: string
  agp: string
  ndk: string
}

const RN_REQUIREMENTS_TABLE: Array<{ minR: number; req: RnRequirements }> = [
  { minR: 0.78, req: { compileSdk: 35, kotlin: '1.9.24', gradle: '8.10.2', agp: '8.7.2', ndk: '26.1.10909125' } },
  { minR: 0.76, req: { compileSdk: 35, kotlin: '1.9.24', gradle: '8.10.2', agp: '8.6.0', ndk: '26.1.10909125' } },
  { minR: 0.73, req: { compileSdk: 34, kotlin: '1.9.0', gradle: '8.8', agp: '8.4.1', ndk: '26.1.10909125' } },
  { minR: 0.71, req: { compileSdk: 33, kotlin: '1.7.22', gradle: '7.5.1', agp: '7.3.1', ndk: '25.1.8937393' } },
]

/** Expo SDK → the RN it pins (deterministic mapping). */
const EXPO_RN: Array<{ sdk: number; rn: number }> = [
  { sdk: 53, rn: 0.79 },
  { sdk: 52, rn: 0.76 },
  { sdk: 51, rn: 0.74 },
  { sdk: 50, rn: 0.73 },
  { sdk: 49, rn: 0.72 },
]

export function requirementsForRn(rnVersion: number | null): RnRequirements | null {
  if (rnVersion === null) return null
  const row = RN_REQUIREMENTS_TABLE.find(r => rnVersion >= r.minR) ?? RN_REQUIREMENTS_TABLE[RN_REQUIREMENTS_TABLE.length - 1]
  return row.req
}

function versionNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const m = String(raw).match(/(\d+)\.(\d+)/)
  if (!m) return null
  return Number(`${m[1]}.${m[2]}`)
}

/** Read package.json deps + native config files into a flat context. */
export function readProjectContext(root: string): ProjectContext {
  const ctx: ProjectContext = {
    flavor: 'unknown',
    rnVersion: null,
    expoVersion: null,
    dependencies: {},
    devDependencies: {},
    nativeModules: [],
    compileSdk: null,
    kotlinVersion: null,
    agpVersion: null,
    gradleVersion: null,
    jvmArgs: null,
  }
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      ctx.dependencies = pkg.dependencies ?? {}
      ctx.devDependencies = pkg.devDependencies ?? {}
      const rn = ctx.dependencies['react-native']
      if (rn) {
        ctx.rnVersion = versionNumber(rn)
        ctx.flavor = 'rn-cli'
      }
      const expo = ctx.dependencies['expo']
      if (expo) {
        ctx.flavor = 'expo'
        ctx.expoVersion = versionNumber(expo)
        if (!ctx.rnVersion) {
          const row = EXPO_RN.find(e => (ctx.expoVersion ?? 0) >= e.sdk)
          ctx.rnVersion = row ? row.rn : null
        }
      }
      ctx.nativeModules = Object.keys(ctx.dependencies).filter(d =>
        /^(@react-native|react-native-|expo-)/.test(d) || d === 'react-native' || d === 'expo'
      )
    } catch (err) {
      reportError(err, 'vc fix: reading package.json')
    }
  }
  // android/build.gradle (root-level in RN templates) — compileSdk, Kotlin, AGP.
  const buildGradle = findBuildGradle(root)
  if (buildGradle) {
    const content = readFileSync(buildGradle, 'utf-8')
    const sdk = content.match(/compileSdkVersion\s*=\s*(\d+)|compileSdkVersion\s+(\d+)/)
    ctx.compileSdk = sdk ? Number(sdk[1] || sdk[2]) : null
    const kotlin = content.match(/kotlinVersion\s*=\s*['"]?([\d.]+)|ext\.kotlin_version\s*=\s*['"]?([\d.]+)|kotlin\(['"]?plugin['"]?\)\s*version\s*['"]?([\d.]+)|org\.jetbrains\.kotlin(?:\.android)?\s*['"]?\s*([\d.]+)/)
    ctx.kotlinVersion = kotlin ? (kotlin[1] || kotlin[2] || kotlin[3] || kotlin[4]) : null
    const agp = content.match(/com\.android\.tools\.build:gradle['"]?\s*:\s*['"]?([\d.]+)/)
    ctx.agpVersion = agp ? agp[1] : null
  }
  const wrapper = join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties')
  if (existsSync(wrapper)) {
    const content = readFileSync(wrapper, 'utf-8')
    const gv = content.match(/distributionUrl=.*gradle-([\d.]+)-bin\.zip/)
    ctx.gradleVersion = gv ? gv[1] : null
  }
  const gradleProps = join(root, 'android', 'gradle.properties')
  if (existsSync(gradleProps)) {
    const content = readFileSync(gradleProps, 'utf-8')
    const jvm = content.match(/org\.gradle\.jvmargs=([^\n]*)/)
    ctx.jvmArgs = jvm ? jvm[1] : null
  }
  return ctx
}

/** The root-level android/build.gradle, or android/app/build.gradle when absent (AGP 8 templates). */
function findBuildGradle(root: string): string | null {
  const candidates = [
    join(root, 'android', 'build.gradle'),
    join(root, 'android', 'app', 'build.gradle'),
    join(root, 'android', 'build.gradle.kts'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return null
}

/** Route a natural-language issue to the analyzer most likely to explain it. */
export function routeIssue(issue: string | undefined): FixKind {
  const s = (issue ?? '').toLowerCase()
  if (/\b(android|gradle|kotlin|sdk|apk|aab|compile|ndk|java)\b/.test(s)) return 'gradle'
  if (/\b(ios|pod|cocoapods|xcode|swift|xcrun|simulator)\b/.test(s)) return 'xcode'
  if (/\b(metro|bundle|resolve module|haste|transform|js heap)\b/.test(s)) return 'metro'
  if (/\b(dep|package|upgrade|version|incompatib|peer)\b/.test(s)) return 'deps'
  return 'general'
}

/** Parse "requires Kotlin >= 2.0" (or "Kotlin 1.9.24 or higher") from log/issue. */
export function readKotlinRequirement(text: string): string | null {
  const m = text.match(/requires?\s+Kotlin\s+(?:>=|≥|version\s*)?\s*(\d+\.\d+(?:\.\d+)?)/i)
  return m ? m[1] : null
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

/** Convert one classifier pass into a finding. */
function findingFromAnalysis(kind: FixKind, analysis: LogAnalysis | null, rootCauseOnly = false): FixFinding[] {
  if (!analysis?.rootCause) return []
  const root = analysis.rootCause
  const line = analysis.matches.find(m => m.id === root.id)?.line ?? null
  const evidence: FixEvidence[] = [
    { file: 'log', line: line ?? undefined, detail: `${root.name}${line ? ` (log line ${line})` : ''}` },
  ]
  const finding: FixFinding = {
    id: root.id,
    severity: 'error',
    rootCause: rootCauseOnly || root.id === 'sdk-platform-not-found' || root.id === 'compile-sdk-version' || root.id === 'agp-version' || root.id === 'dependency-resolution' || root.id === 'memory' || root.id === 'java-version' || root.id === 'ndk-version',
    title: root.name,
    message: root.name,
    recommendedFix: root.fix,
    evidence,
    impact: [],
    applied: 'no-change',
    confidence: 90,
  }
  const corroborating = analysis.matches
    .filter(m => m.id !== root.id)
    .map<FixFinding>(m => ({
      id: m.id,
      severity: 'warning',
      rootCause: false,
      title: m.name,
      message: `Corroborating failure: ${m.name}`,
      recommendedFix: m.fix,
      evidence: [{ file: 'log', line: m.line ?? undefined, detail: m.name }],
      impact: [],
      applied: 'no-change',
      confidence: 85,
    }))
  return [finding, ...corroborating]
}

export interface DiagnoseResult {
  kind: FixKind
  findings: FixFinding[]
  logAnalysis: LogAnalysis | null
}

/**
 * Understand + diagnose. Combines the log classifier (when a log is given),
 * Kotlin-requirement parsing (log or issue), and project-side native checks
 * against the RN-required versions.
 */
export function diagnose(root: string, options: FixOptions): DiagnoseResult {
  const ctx = readProjectContext(root)
  const kind = options.log ? mapLogKind(detectBuildKind(readLog(options.log))) : routeIssue(options.issue)
  let logText = ''
  if (options.log) logText = readLog(options.log)

  const findings: FixFinding[] = []
  let logAnalysis: LogAnalysis | null = null

  // 1 — Log classification (the strongest signal).
  if (options.log && logText) {
    logAnalysis =
      kind === 'gradle' ? analyzeGradleLog(logText)
      : kind === 'xcode' ? analyzeXcodeLog(logText)
      : kind === 'metro' ? analyzeMetroLog(logText)
      : null
    findings.push(...findingFromAnalysis(kind, logAnalysis))
  }

  const req = requirementsForRn(ctx.rnVersion)
  const issueText = `${options.issue ?? ''}\n${logText}`

  // 2 — Kotlin requirement (from the log/issue, then vs the project pin).
  const kotlinReq = readKotlinRequirement(issueText)
  const kotlinBelowProject = ctx.kotlinVersion && req && compareVersions(ctx.kotlinVersion, req.kotlin) < 0
  if (kotlinReq || kotlinBelowProject) {
    const target = kotlinReq ?? req?.kotlin ?? null
    const current = ctx.kotlinVersion
    if (target && current && compareVersions(current, target) < 0) {
      findings.push(kotlinFinding(current, target, kind))
    } else if (kotlinReq && !current) {
      findings.push({
        id: 'kotlin-version',
        severity: 'error',
        rootCause: kind === 'gradle' && !logAnalysis?.rootCause,
        title: 'Kotlin version requirement not met',
        message: `This project's Kotlin must be >= ${kotlinReq} (declared by a dependency).`,
        recommendedFix: `Raise the Kotlin version to ${kotlinReq} in android/build.gradle.`,
        evidence: [{ file: 'log', detail: `Dependency declares "requires Kotlin >= ${kotlinReq}"` }],
        impact: [],
        applied: 'no-change',
        confidence: 88,
      })
    }
  }

  // 3 — Project-side native checks vs the RN-required versions.
  if (req) {
    if (ctx.compileSdk !== null && ctx.compileSdk < req.compileSdk) {
      findings.push({
        id: 'compile-sdk-version',
        severity: 'error',
        rootCause: false,
        title: 'compileSdkVersion too low for RN',
        message: `compileSdkVersion ${ctx.compileSdk} is below the ${req.compileSdk} React Native ${ctx.rnVersion} requires.`,
        recommendedFix: `Raise compileSdkVersion to ${req.compileSdk} in android/build.gradle.`,
        evidence: [{ file: 'android/build.gradle', detail: `compileSdkVersion = ${ctx.compileSdk}` }],
        impact: [],
        applied: 'no-change',
        confidence: 85,
      })
    }
    if (ctx.agpVersion && compareVersions(ctx.agpVersion, req.agp) < 0) {
      findings.push({
        id: 'agp-version',
        severity: 'warning',
        rootCause: false,
        title: 'Android Gradle Plugin below RN template',
        message: `AGP ${ctx.agpVersion} is below the ${req.agp} the RN ${ctx.rnVersion} template pins.`,
        recommendedFix: `Bump AGP to ${req.agp} and the Gradle wrapper to ${req.gradle} together.`,
        evidence: [{ file: 'android/build.gradle', detail: `com.android.tools.build:gradle:${ctx.agpVersion}` }],
        impact: [],
        applied: 'no-change',
        confidence: 82,
      })
    }
    if (ctx.gradleVersion && compareVersions(ctx.gradleVersion, req.gradle) < 0) {
      findings.push({
        id: 'gradle-wrapper-version',
        severity: 'warning',
        rootCause: false,
        title: 'Gradle wrapper below RN template',
        message: `Gradle ${ctx.gradleVersion} is below the ${req.gradle} the RN ${ctx.rnVersion} template pins.`,
        recommendedFix: `Bump gradle/wrapper/gradle-wrapper.properties to ${req.gradle} (with AGP ${req.agp}).`,
        evidence: [{ file: 'android/gradle/wrapper/gradle-wrapper.properties', detail: `gradle-${ctx.gradleVersion}-bin.zip` }],
        impact: [],
        applied: 'no-change',
        confidence: 82,
      })
    }
  }

  // 4 — Gradle daemon memory (only from the log — a real OOM is required).
  if (logAnalysis?.rootCause?.id === 'memory' && ctx.jvmArgs !== null && !/Xmx4g/.test(ctx.jvmArgs ?? '')) {
    findings.push({
      id: 'gradle-memory',
      severity: 'error',
      rootCause: false,
      title: 'Gradle daemon out of memory',
      message: 'The Gradle daemon ran out of memory and the JVM args do not raise the heap.',
      recommendedFix: 'Raise org.gradle.jvmargs in android/gradle.properties to -Xmx4g.',
      evidence: [{ file: 'android/gradle.properties', detail: ctx.jvmArgs }],
      impact: [],
      applied: 'no-change',
      confidence: 90,
    })
  }

  // 5 — Impact: the native modules this project builds (the blast radius of a
  // native-config root cause).
  for (const f of findings) {
    if (f.rootCause && f.impact.length === 0 && ctx.nativeModules.length > 0) {
      f.impact = ctx.nativeModules.slice(0, 12)
    }
  }

  return { kind, findings, logAnalysis }
}

function mapLogKind(kind: string): FixKind {
  if (kind === 'gradle') return 'gradle'
  if (kind === 'xcode') return 'xcode'
  if (kind === 'metro') return 'metro'
  return 'general'
}

function readLog(logPath: string): string {
  try {
    return existsSync(logPath) ? readFileSync(logPath, 'utf-8') : ''
  } catch (err) {
    reportError(err, 'vc fix: reading build log')
    return ''
  }
}

function kotlinFinding(current: string, target: string, kind: FixKind): FixFinding {
  return {
    id: 'kotlin-version',
    severity: 'error',
    rootCause: kind === 'gradle',
    title: 'Kotlin version below requirement',
    message: `Kotlin ${current} is below the ${target} this project needs (declared by a native dependency).`,
    recommendedFix: `Upgrade the Kotlin plugin to ${target} in android/build.gradle.`,
    evidence: [{ file: 'android/build.gradle', detail: `kotlinVersion = ${current} → requires >= ${target}` }],
    impact: [],
    applied: 'no-change',
    confidence: 92,
  }
}

export function severityOf(f: FixFinding): FixSeverity {
  return f.severity
}
