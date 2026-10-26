/**
 * Dependency Conflict Detector (Roadmap 015) — peer-dependency checks against
 * a curated RN ecosystem matrix, plus duplicate-version detection across
 * monorepo members. Produces a conflict report; deterministic.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { detectWorkspace } from '../harness'
import type { DiagnosticCheck } from './types'

/** Curated RN ecosystem compatibility matrix: dependency → version floor rules. */
export interface MatrixRule {
  id: string
  name: string
  /** Test against a semver-ish version string; return the violation message or null. */
  check: (version: string) => string | null
  fix: string
}

function parseMajor(version: string): number | null {
  const m = version.match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

function rnMinor(version: string): number | null {
  const m = version.match(/^0\.(\d+)/)
  return m ? Number(m[1]) : null
}

/** Explicit SDK pairings only; unknown releases stay unverified, never guessed. See https://docs.expo.dev/versions/v58.0.0/. */
export const KNOWN_EXPO_RN_PAIRS: Record<number, number> = { 52: 76, 53: 79, 54: 81, 55: 83, 56: 85, 57: 86, 58: 88 }
export const KNOWN_EXPO_REACT_SERIES: Record<number, string> = { 56: '19.2', 57: '19.2', 58: '19.3' }

export const ECOSYSTEM_MATRIX: MatrixRule[] = [
  {
    id: 'react-native-hermes',
    name: 'Hermes engine',
    check: v => (rnMinor(v) !== null && rnMinor(v)! >= 70 ? null : 'Hermes is default since RN 0.70 — an older RN still supports it but needs explicit config.'),
    fix: 'Enable Hermes (newArchEnabled / hermesEnabled) or upgrade RN — see the upgrade copilot (`vectalon upgrade --to <version>`).',
  },
  {
    id: 'react-native-new-arch',
    name: 'New Architecture readiness',
    check: v => {
      const minor = rnMinor(v)
      if (minor !== null && minor >= 76) return null
      return minor !== null && minor >= 70 ? 'New Architecture is opt-in before RN 0.76 — some packages may not be ready.' : 'New Architecture requires RN 0.76+ (stable) — older versions are legacy bridge.'
    },
    fix: 'Upgrade to RN 0.76+ to use the New Architecture (Fabric + TurboModules) with the current ecosystem.',
  },
]

function versionOf(deps: Record<string, string>, name: string): string | null {
  const raw = deps[name]
  if (!raw) return null
  const m = raw.match(/(\d+\.\d+\.\d+|\d+\.\d+|\d+)/)
  return m ? m[1] : raw
}

/** Peer/ecosystem conflict checks from the project manifest. */
export function dependencyConflictChecks(root: string): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  let pkg: Record<string, unknown> = {}
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    /* missing package.json — handled below */
  }
  const deps = { ...(pkg.dependencies as Record<string, string> | undefined), ...(pkg.devDependencies as Record<string, string> | undefined) } as Record<string, string>
  if (!deps || Object.keys(deps).length === 0) {
    checks.push({ id: 'deps-manifest', title: 'Dependencies', category: 'deps', status: 'info', detail: 'No dependencies found in package.json.' })
    return checks
  }

  const rnVersion = versionOf(deps, 'react-native')
  const reactVersion = versionOf(deps, 'react')
  const expoVersion = versionOf(deps, 'expo')
  const hermesEnabled = deps['hermes-engine'] !== undefined

  if (!rnVersion) {
    checks.push({ id: 'deps-rn', title: 'react-native dependency', category: 'deps', status: 'warn', detail: 'react-native is not a declared dependency — this does not look like a React Native project.' })
    return checks
  }

  // The matrix: run every rule against the detected versions.
  for (const rule of ECOSYSTEM_MATRIX) {
    const violation = rule.check(rnVersion)
    if (violation === null) continue
    checks.push({ id: rule.id, title: rule.name, category: 'deps', status: 'warn', detail: violation, fix: rule.fix })
  }

  if (reactVersion) {
    const rnMajor = rnMinor(rnVersion)
    const reactMajor = parseMajor(reactVersion)
    if (rnMajor !== null && reactMajor !== null && rnMajor >= 76 && reactMajor < 18) {
      checks.push({ id: 'deps-react-floor', title: 'react minimum', category: 'deps', status: 'fail', detail: `RN ${rnVersion} requires react 18+, found react ${reactVersion}.`, fix: 'Upgrade react to 18.3.x (or 19 for RN 0.80+).' })
    }
  }

  if (expoVersion) {
    const expoMajor = parseMajor(expoVersion)
    const rnMajor = rnMinor(rnVersion)
    if (expoMajor !== null && rnMajor !== null) {
      const expectedRn = KNOWN_EXPO_RN_PAIRS[expoMajor]
      if (expectedRn !== undefined && rnMajor !== expectedRn) {
        checks.push({ id: 'deps-expo-rn', title: 'Expo SDK ↔ RN alignment', category: 'deps', status: 'warn', detail: `Expo SDK ${expoMajor} expects react-native ~0.${expectedRn}, found 0.${rnMajor}.`, fix: 'Run `npx expo install react-native` to align to the SDK-pinned version.' })
      }
      const reactSeries = KNOWN_EXPO_REACT_SERIES[expoMajor]
      if (reactSeries && reactVersion && reactVersion.split('.').slice(0, 2).join('.') !== reactSeries) {
        checks.push({ id: 'deps-expo-react', title: 'Expo SDK ↔ React alignment', category: 'deps', status: 'warn', detail: `Expo SDK ${expoMajor} expects react ${reactSeries}.x, found ${reactVersion}.`, fix: 'Run `npx expo install react` to align to the SDK-pinned version.' })
      }
    }
  }

  if (hermesEnabled) {
    checks.push({ id: 'deps-hermes', title: 'Hermes', category: 'deps', status: 'pass', detail: 'hermes-engine present.' })
  }

  // Duplicate version detection across monorepo members (the classic "works
  // in app A, breaks in app B" conflict).
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
      } catch {
        /* skip unreadable member */
      }
    }
    for (const [name, byRange] of byName) {
      if (byRange.size > 1) {
        const ranges = [...byRange.keys()].join(' vs ')
        const holders = [...byRange.values()].flat().join(', ')
        checks.push({ id: `deps-dup-${name.replace(/[^a-z0-9-]/gi, '-')}`, title: `Duplicate ${name}`, category: 'deps', status: 'warn', detail: `${holders} declare different versions (${ranges}).`, fix: 'Align to one version at the workspace root (or via a single catalog) so native builds resolve one copy.' })
      }
    }
  }

  return checks
}


