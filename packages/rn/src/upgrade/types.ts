/**
 * vectalon upgrade — shared types
 * Business Source License 1.1 (BSL-1.1)
 */

import type { NewArchitectureInfo } from '../utils/newArchitecture'

export type RiskLevel = 'low' | 'medium' | 'high'
export type Tooling = 'expo' | 'rn-cli' | null

/** How a migration step is executed. */
export type StepKind = 'auto' | 'review' | 'manual'

export type CatalogCategory = 'dependency' | 'android' | 'ios' | 'javascript' | 'config' | 'deprecated'

/** Everything the migration catalog can see about the project. */
export interface AndroidVersions {
  gradlePropertiesPath: string | null
  gradleProperties: string | null
  buildGradlePath: string | null
  buildGradle: string | null
  /** gradle.properties `hermesEnabled` (RN 0.70+ canonical toggle). */
  hermesEnabled: boolean | null
  /** gradle.properties `newArchEnabled`. */
  newArchEnabled: boolean | null
  /** android/build.gradle `ext.kotlinVersion`. */
  kotlinVersion: string | null
  /** android/build.gradle `ext.compileSdkVersion`. */
  compileSdkVersion: string | null
  /** android/build.gradle `ext.minSdkVersion`. */
  minSdkVersion: string | null
  /** android/build.gradle `ext.targetSdkVersion`. */
  targetSdkVersion: string | null
}

export interface IosVersions {
  podfilePath: string | null
  podfile: string | null
  /** Podfile `:hermes_enabled => true|false` (removed in RN 0.71). */
  hermesEnabled: boolean | null
  /** Podfile RCT_NEW_ARCH_ENABLED / ENABLE_NEW_ARCH_ENABLED == 1. */
  newArchFlag: boolean | null
  /** Podfile `platform :ios, 'X.Y'` floor as a number (e.g. 15.1), null when absent/unparsable. */
  deploymentTarget: number | null
}

export interface DetectedVersions {
  root: string
  hasPackageJson: boolean
  /** Parsed package.json (dependencies/devDependencies), null when absent. */
  packageJson: Record<string, unknown> | null
  /** `react-native` version spec (e.g. "0.72.5"). */
  rnVersion: string | null
  /** `expo` version spec (e.g. "52.0.0"). */
  expoVersion: string | null
  tooling: Tooling
  newArch: NewArchitectureInfo | null
  android: AndroidVersions
  ios: IosVersions
}

export interface CodemodEdit {
  /** Path relative to the project root. */
  path: string
  /**
   * - 'replace': swap `original` (a substring of the current file) for `updated`
   * - 'insert': insert `updated` right after the `original` anchor substring
   * - 'remove': delete the `original` substring
   * - 'write': overwrite the whole file with `updated` (original ignored)
   */
  action: 'replace' | 'insert' | 'remove' | 'write'
  original: string
  updated: string
  detail: string
}

/** What a catalog entry sees when deciding applicability and building edits. */
export interface CatalogContext {
  root: string
  versions: DetectedVersions
  /** Resolved target version string (e.g. "0.76.5") or null when unknown. */
  target: string | null
  /** Impact findings computed before planning (native-module awareness). */
  impact: ImpactFinding[]
}

export interface CatalogEntry {
  id: string
  title: string
  description: string
  category: CatalogCategory
  risk: RiskLevel
  /** New Architecture migration-path related (I-2). */
  newArch?: boolean
  /**
   * Risky codemod: the edit is only applied automatically with --force;
   * otherwise the step stays 'review' for the user to apply manually.
   */
  review?: boolean
  /** True when this entry applies to the detected project/target. */
  applies: (ctx: CatalogContext) => boolean
  /** Deterministic edits; null, undefined, or [] means no automated codemod exists. */
  codemod?: ((ctx: CatalogContext) => CodemodEdit[] | null) | null
  /** Human instructions (static, or computed from the context). */
  manual?: string[] | ((ctx: CatalogContext) => string[])
}

export type ImpactCategory = 'native-module' | 'bridge' | 'fabric' | 'deprecated' | 'config'

export interface ImpactFinding {
  id: string
  category: ImpactCategory
  /** Matched pattern, e.g. `requireNativeComponent`. */
  pattern: string
  /** File path relative to the project root. */
  file: string
  risk: RiskLevel
  detail: string
  /** True when this finding is New-Architecture-specific. */
  newArchRelated?: boolean
}

export interface MigrationStep {
  id: string
  title: string
  description: string
  category: CatalogCategory
  risk: RiskLevel
  kind: StepKind
  newArch?: boolean
  /** Planned codemod edits (in-memory; applied only with --apply). */
  edits: CodemodEdit[]
  manual: string[]
}

export interface VerifyCheck {
  id: string
  name: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  detail: string
}

export interface VerifyResult {
  passed: boolean
  checks: VerifyCheck[]
  /** Bundle size delta vs the pre-upgrade snapshot (fraction, null when none). */
  bundleDeltaPct: number | null
  doctor: { ok: number; missing: number; warnings: number } | null
}

export interface UpgradeProvenance {
  /** `.vectalon/upgrades/<timestamp>` directory, null when nothing was applied. */
  dir: string | null
  /** Provenance manifest path (json), null when nothing was applied. */
  manifest: string | null
  /** Human-readable upgrade report path, null when nothing was applied. */
  report: string | null
}

export interface UpgradeReport {
  root: string
  from: DetectedVersions
  /** Resolved target version, e.g. "0.76.5" (null when unknowable). */
  target: string | null
  tooling: Tooling
  newArchBefore: NewArchitectureInfo | null
  newArchAfter: NewArchitectureInfo | null
  steps: MigrationStep[]
  impact: ImpactFinding[]
  applied: boolean
  dryRun: boolean
  force: boolean
  totalRisk: number
  riskLabel: RiskLevel
  autoSteps: number
  reviewSteps: number
  manualSteps: number
  /** Every planned edit; when applied these are the edits written to disk. */
  edits: CodemodEdit[]
  provenance: UpgradeProvenance
  verify: VerifyResult | null
  generatedAt: number
  errors: string[]
}

export interface UpgradeRunOptions {
  /** Target version: semver ("0.76.3"), major.minor ("0.76"), SDK ("53"), or "latest". */
  to?: string
  /** Preview only — never touch the filesystem. Default true. */
  dryRun?: boolean
  /** Execute codemods + dependency bumps. */
  apply?: boolean
  /** Skip safety checks: applies 'review' steps too and skips confirmation. */
  force?: boolean
  /** Run post-apply verification (doctor, typecheck, bundle gate). Default true. */
  verify?: boolean
  /** Progress callback for live streaming (CLI). */
  onProgress?: (phase: string, message: string) => void
}
