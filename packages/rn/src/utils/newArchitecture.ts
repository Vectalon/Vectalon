import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { reportError } from './safe'

/**
 * React Native New Architecture detection.
 *
 * RN is moving to the New Architecture (Fabric + bridgeless + TurboModules)
 * and the harness previously had zero awareness of which architecture a
 * project uses — so generated code could silently target the legacy bridge.
 * This module reads the canonical toggle points (android/gradle.properties,
 * ios/Podfile, react-native.config.js, Expo app config) and falls back to
 * React Native / Expo SDK version defaults, so guardrails and prompts can
 * adapt to the project's actual architecture.
 */

export interface NewArchitectureInfo {
  /**
   * true = New Architecture (Fabric, bridgeless, TurboModules).
   * false = legacy bridge.
   * null = could not be determined (no signal and no known version).
   */
  enabled: boolean | null
  /** Files/config keys that contributed to the decision. */
  sources: string[]
  /** Human-readable explanation of the decision. */
  reason: string
  /** TurboModule TypeScript spec files found in src/ (basenames). */
  turboModuleSpecs: string[]
}

interface PackageLike {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, 'utf-8')
  } catch (err) {
    reportError(err, 'newArchitecture: reading config file')
    return null
  }
}

/** Parse `0.76.5` / `^0.76.0` / `~53.0.0` into a comparable [major, minor]. */
function versionParts(version: string): [number, number] | null {
  const m = version.match(/(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2])]
}

/** RN 0.76+ enables the New Architecture by default. */
function rnVersionDefault(rnVersion: string): boolean {
  const parts = versionParts(rnVersion)
  if (!parts) return false
  const [major, minor] = parts
  if (major > 0) return true // 1.x — new arch era
  return minor >= 76
}

/** Expo SDK 53+ enables the New Architecture by default. */
function expoSdkDefault(expoVersion: string): boolean {
  const parts = versionParts(expoVersion)
  if (!parts) return false
  const [major, minor] = parts
  if (major > 0) return true
  return minor >= 53
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.expo', 'coverage'])

/** Walk a directory tree (non-recursive helper stack). */
function walkFiles(root: string, onFile: (full: string) => void): void {
  if (!existsSync(root)) return
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (err) {
      reportError(err, 'newArchitecture: reading directory entries')
      continue
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch (err) {
        reportError(err, 'newArchitecture: statting file')
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
      } else {
        onFile(full)
      }
    }
  }
}

/**
 * Find TurboModule TypeScript spec files under src/ — the codegen-style
 * `NativeX.ts` files (containing `TurboModuleRegistry.get`) and explicit
 * `XSpec.ts` declarations (`interface XSpec extends TurboModule`). A file is a
 * spec when its content declares or registers a TurboModule — basename alone is
 * not enough (plain `FooSpec.ts` utilities would false-positive). Basenames
 * only, extension stripped.
 */
export function findTurboModuleSpecs(root: string): string[] {
  const specs = new Set<string>()
  const srcRoot = join(root, 'src')
  walkFiles(srcRoot, full => {
    const base = full.split('/').pop() || full
    if (!/\.(ts|tsx)$/.test(base)) return
    let content: string
    try {
      content = readFileSync(full, 'utf-8')
    } catch (err) {
      reportError(err, 'newArchitecture: reading TurboModule spec file')
      return
    }
    const registers = /TurboModuleRegistry/.test(content)
    const declares = /extends\s+(?:TurboModule|NativeModule)/.test(content)
    if (!registers && !declares) return
    specs.add(base.replace(/\.(ts|tsx)$/, ''))
  })
  return [...specs].sort()
}

/**
 * Detect whether a project runs the React Native New Architecture.
 *
 * Precedence:
 * 1. Explicit `newArchEnabled` / `enableNewArchitecture` in
 *    `android/gradle.properties` (canonical toggle since RN 0.71).
 * 2. `ios/Podfile` — `RCT_NEW_ARCH_ENABLED == '1'` /
 *    `ENABLE_NEW_ARCH_ENABLED` (RN 0.71–0.75 templates); a Podfile with no
 *    flag at all is treated as version-default (RN 0.76+ is always new arch).
 * 3. `react-native.config.js` — explicit `newArchEnabled` / `bridgeless`
 *    keys (rare, but honored when present).
 * 4. Expo `app.json` / `app.config.js` `newArchEnabled` key.
 * 5. Version defaults: RN ≥ 0.76 (or Expo SDK ≥ 53) → enabled by default;
 *    RN 0.71–0.75 → opt-in (disabled unless a flag enables it); < 0.71 →
 *    legacy bridge only.
 *
 * Returns `enabled: null` when no signal exists AND no version can be read.
 */
export function detectNewArchitecture(root: string, pkg: PackageLike): NewArchitectureInfo {
  const sources: string[] = []
  let explicit: boolean | null = null

  // 1. android/gradle.properties — canonical RN CLI toggle.
  const gradleProps = readIfExists(join(root, 'android', 'gradle.properties'))
  if (gradleProps) {
    const m = gradleProps.match(/^\s*(?:newArchEnabled|enableNewArchitecture|newArchitectureEnabled)\s*=\s*(true|false)\s*$/m)
    if (m) {
      explicit = m[1] === 'true'
      sources.push('android/gradle.properties')
    }
  }

  // 2. ios/Podfile — RCT_NEW_ARCH_ENABLED / ENABLE_NEW_ARCH_ENABLED flags.
  // Templates write `ENV['RCT_NEW_ARCH_ENABLED'] == '1'`, so tolerate the
  // bracketed key between the flag name and the comparison operator.
  if (explicit === null) {
    const podfile = readIfExists(join(root, 'ios', 'Podfile'))
    if (podfile) {
      const on = /(?:RCT_NEW_ARCH_ENABLED|ENABLE_NEW_ARCH_ENABLED)[^\n]*==\s*['"]?1['"]?/.test(podfile)
      const off = /(?:RCT_NEW_ARCH_ENABLED|ENABLE_NEW_ARCH_ENABLED)[^\n]*==\s*['"]?0['"]?/.test(podfile)
      if (on && !off) {
        explicit = true
        sources.push('ios/Podfile')
      } else if (off && !on) {
        explicit = false
        sources.push('ios/Podfile')
      }
    }
  }

  // 3. react-native.config.js — explicit keys (rare).
  if (explicit === null) {
    const rnConfig = readIfExists(join(root, 'react-native.config.js'))
    if (rnConfig) {
      const m = rnConfig.match(/newArchEnabled\s*[:=]\s*(true|false)|bridgeless\s*[:=]\s*(true|false)|enableNewArchitecture\s*[:=]\s*(true|false)/)
      if (m) {
        explicit = (m[1] || m[2] || m[3]) === 'true'
        sources.push('react-native.config.js')
      }
    }
  }

  // 4. Expo app config — newArchEnabled key.
  if (explicit === null) {
    for (const name of ['app.json', 'app.config.js', 'app.config.ts']) {
      const appConfig = readIfExists(join(root, name))
      if (appConfig) {
        const m = appConfig.match(/["']?newArchEnabled["']?\s*:\s*(true|false)/)
        if (m) {
          explicit = m[1] === 'true'
          sources.push(name)
          break
        }
      }
    }
  }

  const rnVersion = pkg.dependencies?.['react-native'] || pkg.devDependencies?.['react-native'] || ''
  const expoVersion = pkg.dependencies?.expo || ''

  let enabled: boolean | null
  let reason: string

  if (explicit !== null) {
    enabled = explicit
    reason = explicit
      ? `New Architecture enabled via ${sources.join(', ')}`
      : `New Architecture disabled via ${sources.join(', ')}`
  } else if (rnVersion) {
    enabled = rnVersionDefault(rnVersion)
    reason = enabled
      ? `React Native ${rnVersion} — New Architecture is on by default (RN ≥ 0.76)`
      : `React Native ${rnVersion} — New Architecture is opt-in before 0.76 (no enabling flag found)`
  } else if (expoVersion) {
    enabled = expoSdkDefault(expoVersion)
    reason = enabled
      ? `Expo SDK ${expoVersion} — New Architecture is on by default (SDK ≥ 53)`
      : `Expo SDK ${expoVersion} — New Architecture is opt-in before SDK 53 (no enabling flag found)`
  } else {
    enabled = null
    reason = 'No New Architecture signals found and no react-native / expo version could be read'
  }

  return {
    enabled,
    sources,
    reason,
    turboModuleSpecs: findTurboModuleSpecs(root),
  }
}

/** Short label for prompts and reports. */
export function newArchitectureLabel(info: NewArchitectureInfo | undefined): string {
  if (!info) return 'unknown'
  if (info.enabled === true) return 'enabled (Fabric, bridgeless, TurboModules)'
  if (info.enabled === false) return 'disabled (legacy bridge)'
  return 'unknown'
}

/** True when guardrail rules that assume New Architecture should fire. */
export function isNewArchitectureEnabled(info: NewArchitectureInfo | undefined): boolean {
  return info?.enabled === true
}


