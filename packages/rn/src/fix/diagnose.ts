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
import { analyzeTsLog } from './tsLog'
import { detectBuildKind } from '../buildFix'
import { readProjectIntel } from '../intel/model'
import type { IntelReport } from '../intel/types'
import type { LogAnalysis } from '../projectDiagnostics/types'
import type { FixEvidence, FixFinding, FixOptions, FixSeverity } from './types'

export type FixKind = 'gradle' | 'xcode' | 'metro' | 'ts' | 'deps' | 'general'

export interface ProjectContext {
  flavor: 'expo' | 'rn-cli' | 'unknown'
  rnVersion: number | null
  expoVersion: number | null
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /** Native modules (deps whose package is a native RN/Expo module). */
  nativeModules: string[]
  compileSdk: number | null
  minSdk: number | null
  kotlinVersion: string | null
  agpVersion: string | null
  gradleVersion: string | null
  jvmArgs: string | null
  /** The android/app/build.gradle file used for AGP-8 namespace checks. */
  appGradle: string | null
  hasNamespace: boolean
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

/**
 * Read package.json deps + native config files into a flat context. When the
 * Project Intelligence model is available (readProjectIntel), its canonical
 * manifest + native registry are consumed FIRST — the foundation — and the
 * direct reads only fill the native-config gaps (compileSdk/Kotlin/AGP, which
 * the model does not yet capture).
 */
export function readProjectContext(root: string, intel: IntelReport | null = null): ProjectContext {
  const ctx: ProjectContext = {
    flavor: 'unknown',
    rnVersion: null,
    expoVersion: null,
    dependencies: {},
    devDependencies: {},
    nativeModules: [],
    compileSdk: null,
    minSdk: null,
    kotlinVersion: null,
    agpVersion: null,
    gradleVersion: null,
    jvmArgs: null,
    appGradle: null,
    hasNamespace: false,
  }
  // The foundation: consume the intel manifest when it exists.
  if (intel?.manifest) {
    const m = intel.manifest
    ctx.dependencies = m.dependencies ?? {}
    ctx.rnVersion = versionNumber(m.rnVersion)
    if (m.tooling === 'expo') {
      ctx.flavor = 'expo'
      ctx.expoVersion = m.expoSdkVersion ? versionNumber(m.expoSdkVersion) : null
    } else if (m.tooling === 'rn-cli') {
      ctx.flavor = 'rn-cli'
    }
    ctx.nativeModules = Object.keys(ctx.dependencies).filter(d =>
      /^(@react-native|react-native-|expo-)/.test(d) || d === 'react-native' || d === 'expo'
    )
    // Native registry entries add modules the dep-name filter would miss.
    for (const entry of intel.nativeRegistry?.entries ?? []) {
      if (!ctx.nativeModules.includes(entry.name)) ctx.nativeModules.push(entry.name)
    }
  }
  // Native-config gaps the model does not capture yet — direct, exact reads.
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath) && !intel?.manifest) {
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
    const minSdk = content.match(/minSdkVersion\s*=\s*(\d+)|minSdkVersion\s+(\d+)/)
    ctx.minSdk = minSdk ? Number(minSdk[1] || minSdk[2]) : null
    const kotlin = content.match(/kotlinVersion\s*=\s*['"]?([\d.]+)|ext\.kotlin_version\s*=\s*['"]?([\d.]+)|kotlin\(['"]?plugin['"]?\)\s*version\s*['"]?([\d.]+)|org\.jetbrains\.kotlin(?:\.android)?\s*['"]?\s*([\d.]+)/)
    ctx.kotlinVersion = kotlin ? (kotlin[1] || kotlin[2] || kotlin[3] || kotlin[4]) : null
    const agp = content.match(/com\.android\.tools\.build:gradle['"]?\s*:\s*['"]?([\d.]+)/)
    ctx.agpVersion = agp ? agp[1] : null
  }
  // android/app/build.gradle — AGP-8 namespace presence (a top RN upgrade failure).
  const appGradlePath = join(root, 'android', 'app', 'build.gradle')
  if (existsSync(appGradlePath)) {
    ctx.appGradle = 'android/app/build.gradle'
    const appContent = readFileSync(appGradlePath, 'utf-8')
    ctx.hasNamespace = /namespace\s+['"][^'"]+['"]/.test(appContent)
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

/**
 * Enrich root findings with seam-specific parameters parsed from the
 * log/issue text — the exact values the deterministic edit seams need
 * (the pod name + node_modules path for the Podfile insert, the minSdk
 * floor the merger names, the unresolved module specifier + importer for
 * the import rewrite, the deployment target, the hermes version to align).
 * The planner reads `finding.params` and turns each into one literal edit.
 */
/** Every ts-* finding gets its source file:line + error code + message parsed
 * from the tsc log line (`src/screens/Broken.tsx(3,10): error TS2307: …`), so
 * the TS seams edit exactly the failing line. */
function tsParamsFromLog(text: string): Record<string, string> | null {
  const m = text.match(/([\w./-]+\.tsx?)\((\d+),(\d+)\):\s*error\s+TS(\d+):\s*(.+)/)
  if (!m) return null
  return { file: m[1], line: m[2], tsCode: m[4], tsMsg: m[5].trim() }
}

/**
 * Enrich root findings with seam-specific parameters parsed from the
 * log/issue text — the exact values the deterministic edit seams need
 * (the pod name + node_modules path for the Podfile insert, the minSdk
 * floor the merger names, the unresolved module specifier + importer for
 * the import rewrite, the deployment target, the hermes version to align,
 * the failing source file:line for the TS code seams, the missing native
 * project for the settings.gradle include, the NDK version to align).
 * The planner reads `finding.params` and turns each into one literal edit.
 */
export function enrichFindingParams(findings: FixFinding[], text: string): void {
  if (!text) return
  const ts = tsParamsFromLog(text)
  for (const f of findings) {
    switch (f.id) {
      case 'pod-not-found':
      case 'pod-install-needed': {
        const name =
          text.match(/for pod ["'`]([^"'`]+)["'`]/)?.[1] ??
          text.match(/Unable to find a specification for ["'`]([^"'`]+)["'`]/)?.[1] ??
          text.match(/pod ["'`]([^"'`]+)["'`] could not be found/)?.[1] ??
          text.match(/The Swift pod [`'"]([^`'"]+)[`'"] could not be found/)?.[1] ??
          text.match(/In Podfile:\s*\n\s*([A-Za-z0-9_]+)/)?.[1] ??
          text.match(/[`'"]([A-Za-z0-9_-]+)[`'"] pod could not be found/)?.[1]
        const pkg =
          text.match(/from [`'"](?:\.[/\\])?node_modules\/([^`'"]+)[`'"]/)?.[1] ??
          text.match(/node_modules\/([^`'"\s]+)/)?.[1] ??
          (name && name.startsWith('react-native') ? name : undefined)
        if (name) {
          f.params = { ...f.params, podName: name }
          if (pkg) f.params.podPath = `../node_modules/${pkg}`
        }
        break
      }
      case 'min-sdk-version': {
        const floor = text.match(/cannot be smaller than version (\d+)/)?.[1]
        if (floor) f.params = { ...f.params, minSdkFloor: floor }
        break
      }
      case 'deployment-target': {
        const target = text.match(/range of supported deployment target versions is ([\d.]+)/)?.[1]
        if (target) f.params = { ...f.params, deploymentTarget: target }
        break
      }
      case 'module-resolution': {
        const specifier = text.match(/Unable to resolve module ([^\s]+)|Cannot find module ['"]([^'"]+)['"]/)?.[1]
        const importer = text.match(/from (\/src\/[^:\s]+)/)?.[1]
        if (specifier) {
          f.params = { ...f.params, specifier }
          if (importer) f.params.importer = importer.replace(/^\//, '')
        }
        break
      }
      case 'babel-plugin-missing': {
        const preset = text.match(/Cannot find module ['"]([^'"]+)['"]/)?.[1]
        if (preset) f.params = { ...f.params, preset }
        break
      }
      case 'dependency-resolution': {
        const project = text.match(/Could not find module ['"]:([A-Za-z0-9_-]+)['"]/)?.[1]
        const project2 = text.match(/Could not resolve project \s*:([A-Za-z0-9_-]+)/)?.[1]
        const github = text.match(/Could not resolve (com\.github\.[\w.]+):([\w.-]+)/)?.[1]
        if (project) f.params = { ...f.params, nativeProject: project }
        if (project2) f.params = { ...f.params, nativeProject: project2 }
        if (github) f.params = { ...f.params, githubRepo: github }
        break
      }
      case 'new-arch-mismatch': {
        const flag = text.match(/newArchEnabled=(true|false)/)?.[1]
        if (flag) f.params = { ...f.params, newArchEnabled: flag }
        break
      }
      case 'duplicate-class': {
        // The classifier's message is a short label — parse the real
        // group:artifact:version pairs from the log line itself.
        const pairs = [...text.matchAll(/\(([\w.]+):([\w.-]+):([\d.]+)\)/g)].map(m => ({ group: `${m[1]}:${m[2]}`, version: m[3] }))
        if (pairs.length >= 2) f.params = { ...f.params, duplicateModules: JSON.stringify(pairs) }
        break
      }
      case 'ndk-version': {
        const ndk = text.match(/ndk\/([\d.]+)/)?.[1]
        if (ndk) f.params = { ...f.params, ndkVersion: ndk }
        break
      }
      case 'hermes-android': {
        // A version must follow the engine name (hermes-engine:1.0.0) — never
        // grab the trailing period of "hermes-engine." as a version.
        const version = text.match(/hermes(?:-engine)?[@:]?(\d+(?:\.\d+)+)/)?.[1]
        if (version) f.params = { ...f.params, hermesVersion: version }
        if (/Hermes is disabled|hermesEnabled\s*=\s*false/i.test(text)) {
          f.params = { ...f.params, hermesDisabled: 'true' }
        }
        break
      }
      default:
        break
    }
    // TS code seams share the source file:line + error message. The module
    // specifier is parsed separately — the tsc error names it (TS2307) and the
    // import-rewrite seam needs it.
    if (f.id.startsWith('ts-') && ts) {
      f.params = { ...f.params, ...ts }
      if (f.id === 'ts-module-not-found') {
        const specifier = ts.tsMsg.match(/Cannot find module ['"]([^'"]+)['"]/)?.[1]
        if (specifier) f.params = { ...f.params, specifier }
      }
    }
  }
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
    rootCause: rootCauseOnly || root.id === 'sdk-platform-not-found' || root.id === 'compile-sdk-version' || root.id === 'agp-version' || root.id === 'dependency-resolution' || root.id === 'memory' || root.id === 'java-version' || root.id === 'ndk-version' || root.id === 'duplicate-class' || root.id === 'manifest-merger' || root.id === 'agp-namespace' || root.id === 'min-sdk-version' || root.id === 'package-download' || root.id === 'incompatible-types' || root.id === 'gradle-sync' || root.id.startsWith('ts-'),
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
  // The foundation: consume the shared Project Intelligence model (cached, or
  // one fresh pass per process). Never blocks the workflow if it is missing.
  const intel = readProjectIntel(root)
  const ctx = readProjectContext(root, intel.report)
  const kind = options.log ? mapLogKind(detectBuildKind(readLog(options.log))) : routeIssue(options.issue)
  let logText = ''
  if (options.log) logText = readLog(options.log)

  const findings: FixFinding[] = []
  let logAnalysis: LogAnalysis | null = null

  // 1 — Log classification (the strongest signal).
  if (options.log && logText) {
    // A tsc/tsc -b output (`error TS2307: ...`) routes to the TypeScript
    // regression analyzer — a real failure family the directive names.
    const isTsLog = /error\s+TS\d+\s*:/.test(logText)
    logAnalysis =
      isTsLog ? analyzeTsLog(logText)
      : kind === 'gradle' ? analyzeGradleLog(logText)
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

  // 4b — AGP-8 namespace requirement (no log needed; a top RN upgrade failure
  // after moving to AGP 8: "Namespace not specified").
  if (ctx.appGradle && !ctx.hasNamespace) {
    findings.push({
      id: 'agp-namespace',
      severity: 'error',
      rootCause: false,
      title: 'AGP 8 namespace not specified',
      message: 'android/app/build.gradle has no namespace — AGP 8 requires it and the build fails with "Namespace not specified".',
      recommendedFix: 'Add `namespace "com.<appid>"` to android/app/build.gradle (AGP 8 removed the old package-name inference).',
      evidence: [{ file: 'android/app/build.gradle', detail: 'no namespace block' }],
      impact: [],
      applied: 'no-change',
      confidence: 90,
    })
  }

  // 4c — minSdkVersion floor (a top native-module linking failure: "cannot be
  // smaller than version 23").
  if (ctx.minSdk !== null && ctx.minSdk < 23) {
    findings.push({
      id: 'min-sdk-version',
      severity: 'error',
      rootCause: false,
      title: 'minSdkVersion too low for RN native modules',
      message: `minSdkVersion ${ctx.minSdk} is below the 23 React Native (and most native modules) require — manifest merger fails.`,
      recommendedFix: `Raise minSdkVersion to 23 in android/build.gradle.`,
      evidence: [{ file: 'android/build.gradle', detail: `minSdkVersion = ${ctx.minSdk}` }],
      impact: [],
      applied: 'no-change',
      confidence: 88,
    })
  }

  // 4d — Seam parameters: the exact values the deterministic edit seams need,
  // parsed from the log/issue text into each finding (pod name + path, minSdk
  // floor, module specifier + importer, hermes version, deployment target).
  enrichFindingParams(findings, issueText)

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
  if (kind === 'ts') return 'ts'
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
