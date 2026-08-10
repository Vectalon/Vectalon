/**
 * vectalon upgrade — Plan stage
 * Business Source License 1.1 (BSL-1.1)
 *
 * Detect → catalog → impact → plan. Produces a deterministic, step-by-step
 * migration plan with risk scoring. Nothing touches the filesystem beyond
 * reads (planning is always side-effect free).
 */

import { detectVersions, describeDetection, versionParts } from './detect'
import { MIGRATION_CATALOG, resolveTargetRn, LATEST_KNOWN_RN, EXPO_SDK_RN_PAIRS, latestKnownExpoSdk, latestKnownRnMinor } from './catalog'
import { analyzeUpgradeImpact, summarizeImpact } from './impact'
import { detectNewArchitecture } from '../utils/newArchitecture'
import { rnDiffPurgeUrl, upgradeHelperUrl } from './rnDiffPurge'
import type { CatalogContext, MigrationStep, RiskLevel, UpgradeReport, UpgradeRunOptions } from './types'

const RISK_WEIGHT: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 }

/** Resolve and validate the --to target. Never throws; errors go into the report. */
export function resolveTarget(to: string | null | undefined, tooling: 'expo' | 'rn-cli' | null): { target: string | null; error: string | null } {
  if (!to || to === 'latest') {
    // Latest known stable from the catalog (offline, deterministic).
    return tooling === 'expo' ? { target: String(latestKnownExpoSdk()), error: null } : { target: LATEST_KNOWN_RN, error: null }
  }
  const trimmed = to.trim()
  if (/^latest$/i.test(trimmed)) {
    return tooling === 'expo' ? { target: String(latestKnownExpoSdk()), error: null } : { target: LATEST_KNOWN_RN, error: null }
  }
  // Expo SDK target: "53" / "53.0".
  const sdk = trimmed.match(/^(\d{2})(?:\.\d+)?$/)
  if (sdk && Number(sdk[1]) >= 40) {
    const rnMinor = EXPO_SDK_RN_PAIRS[Number(sdk[1])]
    return rnMinor
      ? { target: sdk[1], error: null }
      : { target: sdk[1], error: `Expo SDK ${sdk[1]} is newer than this catalog knows (latest mapped SDK is ${latestKnownExpoSdk()}) — re-run with a supported SDK.` }
  }
  // RN semver: "0.76" / "0.76.3".
  const parts = versionParts(trimmed)
  if (parts && parts[0] === 0 && parts[1] >= 60 && parts[1] <= latestKnownRnMinor()) {
    return { target: `${parts[0]}.${parts[1]}.${parts[2] ?? 0}`, error: null }
  }
  if (parts && parts[0] === 0 && parts[1] > latestKnownRnMinor()) {
    return { target: trimmed, error: `React Native 0.${parts[1]} is newer than this catalog knows (latest is ${LATEST_KNOWN_RN}) — the plan will note review steps.` }
  }
  return { target: null, error: `Could not parse target version "${trimmed}". Use an RN version (e.g. --to 0.76), an Expo SDK (e.g. --to 53), or 'latest'.` }
}

function riskLabel(total: number): RiskLevel {
  if (total >= 8) return 'high'
  if (total >= 4) return 'medium'
  return 'low'
}

/** Full major.minor.patch semver from any parseable spec; null when the patch is missing. */
function fullSemver(version: string): string | null {
  const parts = versionParts(version)
  if (!parts || parts[2] === undefined) return null
  return `${parts[0]}.${parts[1]}.${parts[2]}`
}

/** True when `to` is a strictly newer major.minor.patch than `from`. */
function isForwardUpgrade(from: string, to: string): boolean {
  const a = from.split('.').map(Number)
  const b = to.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

/** Build the full plan (detect + catalog + impact) without writing anything. */
export function planUpgrade(root: string, options: UpgradeRunOptions = {}): UpgradeReport {
  const errors: string[] = []
  const from = detectVersions(root)

  if (!from.hasPackageJson || from.tooling === null) {
    return {
      root,
      from,
      target: null,
      tooling: from.tooling,
      newArchBefore: from.newArch,
      newArchAfter: null,
      steps: [],
      impact: [],
      applied: false,
      dryRun: options.dryRun !== false,
      force: options.force === true,
      totalRisk: 0,
      riskLabel: 'low',
      autoSteps: 0,
      reviewSteps: 0,
      manualSteps: 0,
      edits: [],
      provenance: { dir: null, manifest: null, report: null },
      verify: null,
      generatedAt: Date.now(),
      errors: [
        from.hasPackageJson
          ? 'No React Native / Expo project detected — package.json has no react-native or expo dependency. Run this inside an RN/Expo project (or pass the project directory).'
          : 'No package.json found — run this inside a React Native / Expo project (or pass the project directory).',
      ],
    }
  }

  const { target, error } = resolveTarget(options.to, from.tooling)
  if (error) errors.push(error)
  if (target === null) {
    return { ...planUpgrade(root, { ...options, to: undefined }), errors }
  }

  // Impact analysis (I-1 / I-2).
  const targetRn = resolveTargetRn(target)
  const impact = analyzeUpgradeImpact(from, targetRn)

  const ctx: CatalogContext = { root, versions: from, target, impact }

  // Steps: every catalog entry that applies.
  const steps: MigrationStep[] = []
  const edits: MigrationStep['edits'] = []
  for (const entry of MIGRATION_CATALOG) {
    let applies = false
    try {
      applies = entry.applies(ctx)
    } catch (err) {
      errors.push(`catalog entry ${entry.id} failed to evaluate: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    if (!applies) continue

    let entryEdits: MigrationStep['edits'] = []
    if (entry.codemod) {
      try {
        entryEdits = entry.codemod(ctx) || []
      } catch (err) {
        errors.push(`codemod ${entry.id} failed: ${err instanceof Error ? err.message : String(err)}`)
        entryEdits = []
      }
    }
    edits.push(...entryEdits)

    // kind: auto (safe codemods), review (risky codemods need --force), manual.
    const kind = entry.codemod && entryEdits.length > 0 ? (entry.review ? 'review' : 'auto') : 'manual'

    steps.push({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      category: entry.category,
      risk: entry.risk,
      kind,
      newArch: entry.newArch,
      edits: entryEdits,
      manual: typeof entry.manual === 'function' ? entry.manual(ctx) : (entry.manual || []),
    })
  }

  // The official rn-diff-purge template diff — the community source of truth
  // for CLI-app upgrades. Every plan for a bare RN CLI project gets a manual
  // step pointing at the exact from→to template diff, which always covers BOTH
  // the native (android/, ios/, Gemfile) and JS/TS (App.tsx, index.js, babel/
  // metro/ts configs, package.json) changes to apply — even for releases
  // newer than this catalog. Deterministic (no network): the URL is derived
  // from the pair; `vectalon upgrade --diff` / the get_rn_upgrade_diff MCP
  // tool fetch it live. Expo has its own upgrade path, so this is rn-cli only.
  const fromFull = from.rnVersion ? fullSemver(from.rnVersion) : null
  const toFull = target ? fullSemver(target) : null
  // rn-diff-purge only publishes forward diffs — skip same-version and
  // downgrade pairs where the URL would 404.
  if (from.tooling === 'rn-cli' && fromFull !== null && toFull !== null && isForwardUpgrade(fromFull, toFull)) {
    steps.push({
      id: 'rn-diff-purge',
      title: 'Apply the official rn-diff-purge template diff',
      description:
        'The community-maintained template diff between the exact from→to versions — the authoritative CLI-app upgrade source. Covers BOTH native changes (android/, ios/, Gemfile) and JS/TS changes (App.tsx, index.js, babel/metro/ts configs, package.json) to apply.',
      category: 'config',
      risk: 'medium',
      kind: 'manual',
      edits: [],
      manual: [
        `Fetch the raw diff: ${rnDiffPurgeUrl(fromFull, toFull)}`,
        `Interactive view: ${upgradeHelperUrl(fromFull, toFull)}`,
        `Or run: vectalon upgrade --to ${toFull} --diff — prints the categorized native + JS/TS changes`,
      ],
    })
  }

  const totalRisk = steps.reduce((acc, s) => acc + RISK_WEIGHT[s.risk], 0)
  const autoSteps = steps.filter(s => s.kind === 'auto').length
  const reviewSteps = steps.filter(s => s.kind === 'review').length
  const manualSteps = steps.filter(s => s.kind === 'manual').length

  const dryRun = options.dryRun !== false

  return {
    root,
    from,
    target,
    tooling: from.tooling,
    newArchBefore: from.newArch,
    newArchAfter: null,
    steps,
    impact,
    applied: false,
    dryRun,
    force: options.force === true,
    totalRisk,
    riskLabel: riskLabel(totalRisk),
    autoSteps,
    reviewSteps,
    manualSteps,
    edits,
    provenance: { dir: null, manifest: null, report: null },
    verify: null,
    generatedAt: Date.now(),
    errors,
  }
}

/** Re-detect the New Architecture after edits (for the report's after-state). */
export function refreshNewArchAfter(root: string, report: UpgradeReport): UpgradeReport {
  const pkg = report.from.packageJson || undefined
  if (!pkg) return report
  return { ...report, newArchAfter: detectNewArchitecture(root, pkg) }
}

export { describeDetection, summarizeImpact }
