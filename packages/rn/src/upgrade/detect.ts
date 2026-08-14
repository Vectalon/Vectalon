/**
 * vectalon upgrade — Detect stage
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reads the current React Native / Expo state from the project on disk:
 * package.json (react-native, expo, deps), android/gradle.properties +
 * android/build.gradle (Hermes, New Architecture, SDK levels, Kotlin), the
 * iOS Podfile (Hermes flag, New Architecture flag), and app.json/app.config
 * (Expo). No network, no subprocesses — deterministic.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { detectNewArchitecture, type NewArchitectureInfo } from '../utils/newArchitecture'
import type { AndroidVersions, DetectedVersions, IosVersions, Tooling } from './types'

/** Parse a version spec into [major, minor, patch?]; null when unparseable. */
export function versionParts(version: string): [number, number, number?] | null {
  const m = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), m[3] !== undefined ? Number(m[3]) : undefined]
}

/** True when version `a` is >= version `b` (both [major, minor]). */
export function isAtLeast(a: [number, number] | null, b: [number, number]): boolean {
  if (!a) return false
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])
}

/** Compare two [major, minor] pairs. */
export function compareMajorMinor(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  return a[1] - b[1]
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, 'utf-8')
  } catch (err) {
    reportError(err, `upgrade: reading ${path}`)
    return null
  }
}

function parsePackageJson(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (err) {
    reportError(err, 'upgrade: parsing package.json')
    return null
  }
}

function depOf(pkg: Record<string, unknown>, name: string): string | null {
  const deps = pkg.dependencies as Record<string, string> | undefined
  const devDeps = pkg.devDependencies as Record<string, string> | undefined
  const peerDeps = pkg.peerDependencies as Record<string, string> | undefined
  return deps?.[name] ?? devDeps?.[name] ?? peerDeps?.[name] ?? null
}

/** Pull `key = value` from a properties file. */
function propOf(content: string | null, key: string): string | null {
  if (!content) return null
  const m = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)\\s*$`, 'm'))
  return m ? m[1] : null
}

/**
 * Extract `ext.<name> = "x"` (top-level) or `name = "x"` inside an
 * `ext { … }` block (the RN template form) from android/build.gradle.
 */
function gradleExt(buildGradle: string | null, name: string): string | null {
  if (!buildGradle) return null
  // `;{}` excluded from the value class so single-line `ext { … }` blocks
  // report clean values (e.g. `compileSdkVersion = 33;` → `33`, not `33;`).
  const prefixed = buildGradle.match(new RegExp(`ext\\.${name}\\s*=\\s*["']?([^"',\\s;{}]+)["']?`))
  if (prefixed) return prefixed[1]
  const bare = buildGradle.match(new RegExp(`${name}\\s*=\\s*["']?([^"',\\s;{}]+)["']?`))
  return bare ? bare[1] : null
}

function parseAndroid(root: string): AndroidVersions {
  const gradlePropertiesPath = join(root, 'android', 'gradle.properties')
  const buildGradlePath = join(root, 'android', 'build.gradle')
  const gradleProperties = readIfExists(gradlePropertiesPath)
  const buildGradle = readIfExists(buildGradlePath)

  const hermesRaw = propOf(gradleProperties, 'hermesEnabled')
  const newArchRaw = propOf(gradleProperties, 'newArchEnabled')

  return {
    gradlePropertiesPath: gradleProperties !== null ? 'android/gradle.properties' : null,
    gradleProperties,
    buildGradlePath: buildGradle !== null ? 'android/build.gradle' : null,
    buildGradle,
    hermesEnabled: hermesRaw === 'true' ? true : hermesRaw === 'false' ? false : null,
    newArchEnabled: newArchRaw === 'true' ? true : newArchRaw === 'false' ? false : null,
    kotlinVersion: gradleExt(buildGradle, 'kotlinVersion'),
    compileSdkVersion: gradleExt(buildGradle, 'compileSdkVersion'),
    minSdkVersion: gradleExt(buildGradle, 'minSdkVersion'),
    targetSdkVersion: gradleExt(buildGradle, 'targetSdkVersion'),
  }
}

function parseIos(root: string): IosVersions {
  const podfilePath = join(root, 'ios', 'Podfile')
  const podfile = readIfExists(podfilePath)
  if (podfile === null) {
    return { podfilePath: null, podfile: null, hermesEnabled: null, newArchFlag: null, deploymentTarget: null }
  }
  const hermesRaw = podfile.match(/:hermes_enabled\s*=>\s*(true|false)/)
  const newArchOn = /(?:RCT_NEW_ARCH_ENABLED|ENABLE_NEW_ARCH_ENABLED)[^\n]*==\s*['"]?1['"]?/.test(podfile)
  // The deployment-target floor the upgrade advisor (Roadmap 036) compares
  // against the target release's required minimum. Both Podfile spellings:
  // `platform :ios, '13.4'` (shorthand) and
  // `platform :ios, :deployment_target => '13.4'` (hash form).
  const platform = podfile.match(/platform\s*:\s*ios\s*,\s*(?::\s*deployment_target\s*=>\s*)?['"](\d+(?:\.\d+)?)['"]/)
  return {
    podfilePath: 'ios/Podfile',
    podfile,
    hermesEnabled: hermesRaw ? hermesRaw[1] === 'true' : null,
    newArchFlag: newArchOn,
    deploymentTarget: platform ? Number(platform[1]) : null,
  }
}

/** Resolve the tooling flavor: expo when the expo package is present, else rn-cli. */
export function detectTooling(pkg: Record<string, unknown> | null, rnVersion: string | null, expoVersion: string | null): Tooling {
  if (expoVersion) return 'expo'
  if (rnVersion) return 'rn-cli'
  if (!pkg) return null
  // Some Expo projects keep `expo` in devDependencies only.
  const deps = pkg.dependencies as Record<string, string> | undefined
  const devDeps = pkg.devDependencies as Record<string, string> | undefined
  if (deps?.expo || devDeps?.expo) return 'expo'
  if (deps?.['react-native'] || devDeps?.['react-native']) return 'rn-cli'
  return null
}

/**
 * Detect the current React Native / Expo versions and native config state.
 * Never throws — returns a best-effort snapshot with nulls for what is absent.
 */
export function detectVersions(root: string): DetectedVersions {
  const packageJsonPath = join(root, 'package.json')
  const packageJsonRaw = readIfExists(packageJsonPath)
  const packageJson = packageJsonRaw !== null ? parsePackageJson(packageJsonRaw) : null

  const rnVersion = packageJson ? depOf(packageJson, 'react-native') : null
  const expoVersion = packageJson ? depOf(packageJson, 'expo') : null
  const tooling = detectTooling(packageJson, rnVersion, expoVersion)
  const newArch = packageJson ? detectNewArchitecture(root, packageJson) : null

  return {
    root,
    hasPackageJson: packageJson !== null,
    packageJson,
    rnVersion,
    expoVersion,
    tooling,
    newArch,
    android: parseAndroid(root),
    ios: parseIos(root),
  }
}

/** Human-readable one-liner of what was detected (for the report header). */
export function describeDetection(v: DetectedVersions): string {
  const parts: string[] = []
  if (v.rnVersion) parts.push(`react-native ${v.rnVersion}`)
  if (v.expoVersion) parts.push(`expo ${v.expoVersion}`)
  if (v.tooling === 'expo') parts.push('Expo project')
  else if (v.tooling === 'rn-cli') parts.push('bare RN CLI project')
  if (v.newArch?.enabled !== null) parts.push(`New Architecture ${v.newArch?.enabled ? 'ON' : 'OFF'}`)
  return parts.length > 0 ? parts.join(' · ') : 'no React Native / Expo project detected'
}

export type { NewArchitectureInfo }
