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

export const ECOSYSTEM_MATRIX: MatrixRule[] = [
  {
    id: 'react-native-hermes',
    name: 'Hermes engine',
    check: v => (parseMajor(v) !== null && parseMajor(v)! >= 70 ? null : 'Hermes is default since RN 0.70 — an older RN still supports it but needs explicit config.'),
    fix: 'Enable Hermes (newArchEnabled / hermesEnabled) or upgrade RN — see the upgrade copilot (`vectalon upgrade --to <version>`).',
  },
  {
    id: 'react-native-react',
    name: 'react-native ↔ react pairing',
    check: v => {
      const major = parseMajor(v)
      if (major === null) return null
      // RN 0.7x ships with react 18.x; RN 0.76+ allows react 18.3; RN 0.80 targets react 19.
      const react = ['0.76', '0.77', '0.78', '0.79', '0.80', '0.81'].some(p => v.startsWith(p))
      return react ? null : 'react 18.x is the tested pairing for RN 0.7x releases — verify your react version against the RN release notes.'
    },
    fix: 'Align react to the version the RN release template pins (check `react` in your package.json vs the RN changelog template).',
  },
  {
    id: 'expo-sdk-react-native',
    name: 'Expo SDK ↔ react-native pairing',
    check: v => {
      // Expo SDK 52 → RN 0.76, SDK 53 → RN 0.79, SDK 54 → RN 0.81 (approx. recent).
      if (v.startsWith('0.76')) return null
      if (v.startsWith('0.79')) return null
      if (v.startsWith('0.81')) return null
      return 'This react-native version may not match the Expo SDK you are on — Expo pins a specific RN version per SDK release.'
    },
    fix: 'Use the exact react-native version your Expo SDK pins (Expo docs → SDK changelog) or run `npx expo install react-native` to auto-align.',
  },
  {
    id: 'react-native-new-arch',
    name: 'New Architecture readiness',
    check: v => {
      const major = parseMajor(v)
      if (major !== null && major >= 76) return null
      return major !== null && major >= 70 ? 'New Architecture is opt-in before RN 0.76 — some packages may not be ready.' : 'New Architecture requires RN 0.76+ (stable) — older versions are legacy bridge.'
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
    const target = rule.id === 'expo-sdk-react-native' ? rnVersion : rnVersion
    const violation = rule.check(target)
    if (violation === null) continue
    checks.push({ id: rule.id, title: rule.name, category: 'deps', status: 'warn', detail: violation, fix: rule.fix })
  }

  if (reactVersion) {
    const rnMajor = parseMajor(rnVersion)
    const reactMajor = parseMajor(reactVersion)
    if (rnMajor !== null && reactMajor !== null && rnMajor >= 76 && reactMajor < 18) {
      checks.push({ id: 'deps-react-floor', title: 'react minimum', category: 'deps', status: 'fail', detail: `RN ${rnVersion} requires react 18+, found react ${reactVersion}.`, fix: 'Upgrade react to 18.3.x (or 19 for RN 0.80+).' })
    }
  }

  if (expoVersion) {
    const expoMajor = parseMajor(expoVersion)
    const rnMajor = parseMajor(rnVersion)
    if (expoMajor !== null && rnMajor !== null) {
      const expectedRn = expoMajor >= 54 ? 81 : expoMajor >= 53 ? 79 : expoMajor >= 52 ? 76 : null
      if (expectedRn !== null && rnMajor !== expectedRn) {
        checks.push({ id: 'deps-expo-rn', title: 'Expo SDK ↔ RN alignment', category: 'deps', status: 'warn', detail: `Expo SDK ${expoMajor} expects react-native ~0.${expectedRn}, found 0.${rnMajor}.`, fix: 'Run `npx expo install react-native` to align to the SDK-pinned version.' })
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


