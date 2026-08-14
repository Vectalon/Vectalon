/**
 * Hermes Diagnostics (Roadmap 012) — validate Hermes configuration (Android
 * gradle.properties, iOS Podfile, New Architecture) against a known-issue
 * database and recommend fixes. Deterministic, no model calls.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import type { DiagnosticCheck } from './types'

/** Known Hermes issues: RN version + condition → warning + fix. */
export interface HermesIssueRule {
  id: string
  name: string
  /** Return a message when the rule fires, else null. */
  check: (rnMajor: number | null, ctx: { hermesEnabled: boolean | null; newArch: boolean | null; expo: boolean }) => string | null
  fix: string
}

export const HERMES_ISSUES: HermesIssueRule[] = [
  {
    id: 'hermes-disabled',
    name: 'Hermes disabled',
    check: (_rn, ctx) => (ctx.hermesEnabled === false ? 'Hermes is explicitly disabled — you lose the bytecode compiler, lower memory use, and faster startup.' : null),
    fix: 'Enable Hermes: `hermesEnabled=true` in android/gradle.properties (RN 0.70+) and `:hermes_enabled => true` in the Podfile, or `npx react-native run-android --mode=release` after enabling.',
  },
  {
    id: 'hermes-undetermined',
    name: 'Hermes state unknown',
    check: (rn, ctx) => (rn !== null && rn >= 70 && ctx.hermesEnabled === null ? 'Could not confirm Hermes is on — RN 0.70+ enables it by default, but an explicit flag is absent.' : null),
    fix: 'Leave the default (Hermes on) or set the flags explicitly so builds are reproducible: `hermesEnabled=true` in gradle.properties.',
  },
  {
    id: 'hermes-new-arch-mismatch',
    name: 'Hermes + New Architecture',
    check: (_rn, ctx) => (ctx.hermesEnabled === false && ctx.newArch === true ? 'New Architecture requires Hermes — Hermes is disabled while newArchEnabled=true, which breaks the Fabric/TurboModule runtime.' : null),
    fix: 'Re-enable Hermes (`hermesEnabled=true`) — the New Architecture depends on it; you cannot run Fabric with JSC on current RN.',
  },
  {
    id: 'hermes-legacy-rn',
    name: 'Hermes on legacy RN',
    check: (rn, ctx) => (rn !== null && rn < 70 && ctx.hermesEnabled === true ? `RN ${rn} predates Hermes-as-default — your config opts into an engine that version may not fully support.` : null),
    fix: 'Upgrade to RN 0.70+ for a supported Hermes default, or keep JSC on that legacy version (remove hermesEnabled=true).',
  },
]

/** Read the RN major from a version string like "0.76.5" or "76.0.0-rc.0". */
function rnMajor(version: string): number | null {
  const m = version.match(/(?:^|[^0-9])(\d+)\.(\d+)/)
  if (!m) return null
  const major = Number(m[1])
  // RN versions read as 0.7x, Expo SDK as 5x.
  return major === 0 ? Number(m[2]) : major
}

/** Hermes checks: config flags from gradle.properties / Podfile / app.json. */
export function hermesChecks(root: string): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  let gradleProps = ''
  const gpPath = join(root, 'android', 'gradle.properties')
  if (existsSync(gpPath)) {
    try {
      gradleProps = readFileSync(gpPath, 'utf-8')
    } catch (err) {
      reportError(err, 'diagnostics: reading android/gradle.properties')
    }
  }
  let podfile = ''
  const pfPath = join(root, 'ios', 'Podfile')
  if (existsSync(pfPath)) {
    try {
      podfile = readFileSync(pfPath, 'utf-8')
    } catch (err) {
      reportError(err, 'diagnostics: reading ios/Podfile')
    }
  }
  let appJson = ''
  const ajPath = join(root, 'app.json')
  if (existsSync(ajPath)) {
    try {
      appJson = readFileSync(ajPath, 'utf-8')
    } catch (err) {
      reportError(err, 'diagnostics: reading app.json')
    }
  }

  const hermesEnabled =
    /^\s*hermesEnabled\s*=\s*(true|false)\s*$/m.exec(gradleProps)?.[1] === 'true'
      ? true
      : /^\s*hermesEnabled\s*=\s*(true|false)\s*$/m.exec(gradleProps)?.[1] === 'false'
        ? false
        : /:hermes_enabled\s*=>\s*(true|false)/.exec(podfile)?.[1] === 'true'
          ? true
          : /:hermes_enabled\s*=>\s*(true|false)/.exec(podfile)?.[1] === 'false'
            ? false
            : /["']hermes["']\s*:\s*(true|false)/.exec(appJson)?.[1] === 'true'
              ? true
              : /["']hermes["']\s*:\s*(true|false)/.exec(appJson)?.[1] === 'false'
                ? false
                : null
  const newArch =
    /^\s*newArchEnabled\s*=\s*(true|false)\s*$/m.exec(gradleProps)?.[1] === 'true'
      ? true
      : /^\s*newArchEnabled\s*=\s*(true|false)\s*$/m.exec(gradleProps)?.[1] === 'false'
        ? false
        : /["']newArchEnabled["']\s*:\s*(true|false)/.exec(appJson)?.[1] === 'true'
          ? true
          : /["']newArchEnabled["']\s*:\s*(true|false)/.exec(appJson)?.[1] === 'false'
            ? false
            : null

  let rnVersion: string | null = null
  let expo = false
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    rnVersion = deps['react-native'] ?? null
    expo = deps['expo'] !== undefined
  } catch {
    /* no package.json — defaults below */
  }
  const major = rnVersion ? rnMajor(rnVersion) : null

  if (rnVersion) {
    checks.push({
      id: 'hermes-rn-version',
      title: 'React Native version',
      category: 'hermes',
      status: 'pass',
      detail: `react-native ${rnVersion}${expo ? ' (Expo project)' : ''}`,
    })
  }

  const ctx = { hermesEnabled, newArch, expo }
  let fired = 0
  for (const rule of HERMES_ISSUES) {
    const message = rule.check(major, ctx)
    if (message === null) continue
    fired++
    checks.push({ id: rule.id, title: rule.name, category: 'hermes', status: 'warn', detail: message, fix: rule.fix })
  }

  if (fired === 0) {
    const state = hermesEnabled === true ? 'enabled' : hermesEnabled === false ? 'disabled' : 'default'
    const arch = newArch === true ? 'New Architecture on' : newArch === false ? 'New Architecture off' : 'New Architecture default'
    checks.push({
      id: 'hermes-ok',
      title: 'Hermes configuration',
      category: 'hermes',
      status: 'pass',
      detail: `Hermes ${state}; ${arch} — no known issues from the rule database.`,
    })
  }

  // Known runtime advisory: iOS release builds with Hermes need the bytecode
  // flag set, and debug/profile differences are a classic footgun.
  checks.push({
    id: 'hermes-runtime-advisory',
    title: 'Hermes runtime advisory',
    category: 'hermes',
    status: 'info',
    detail: 'Hermes behaves differently between debug (interpreted) and release (bytecode) — test memory/startup claims on a release build, and check `hermesFlags` when profiling with Hermes.',
    fix: 'Profile against a release build (`npx react-native run-android --mode=release` / `run-ios --configuration Release`); use `vectalon profile` on the .cpuprofile output.',
  })

  return checks
}
