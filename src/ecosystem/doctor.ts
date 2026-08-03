import { join } from 'path'
import { listEcosystemItems } from './catalog'
import { readEcosystemConfig } from './config'
import type { EcosystemItem } from './types'

export type DoctorStatus = 'ok' | 'missing' | 'warning'

export type DoctorCategory = EcosystemItem['category'] | 'toolchain'

export interface DoctorCheckResult {
  id: string
  name: string
  category: DoctorCategory
  flavor: string
  status: DoctorStatus
  detail: string
  hint?: string
}

export interface DoctorReport {
  /** Per-enabled-ecosystem-item checks. */
  checks: DoctorCheckResult[]
  /** Native toolchain checks (Node, JDK, Android, iOS, Metro). */
  toolchain: DoctorCheckResult[]
  enabledCount: number
  okCount: number
  missingCount: number
  warningCount: number
}

/**
 * Injectable checkers so the doctor logic is unit-testable without spawning
 * real processes or touching the network. The CLI wires real implementations.
 */
export interface DoctorCheckers {
  /** Resolve an npm package from the project root; true when installed locally. */
  packageInstalled: (packageName: string) => boolean
  /**
   * Run a command and report whether it exited successfully. For MCP probes
   * the CLI passes a bounded npx --no-install invocation.
   */
  run: (command: string, args: string[]) => { success: boolean; output: string }
  /** Check whether a directory exists on disk (skills install dirs). */
  dirExists: (dir: string) => boolean
  /** Read an environment variable (e.g. ANDROID_HOME, ANDROID_SDK_ROOT). */
  env: (name: string) => string | undefined
  /** True when a TCP listener is accepting connections on localhost:port. */
  portOpen: (port: number) => boolean
  /** Host platform (darwin/darwin for Xcode/CocoaPods gating). */
  platform: NodeJS.Platform
}

/** Toolchain IDs and their human-readable names. */
export const TOOLCHAIN_ITEM_IDS = [
  'node',
  'jdk',
  'android-sdk',
  'android-emulator',
  'xcode',
  'cocoapods',
  'metro-port',
] as const

export type ToolchainItemId = (typeof TOOLCHAIN_ITEM_IDS)[number]

export interface ToolchainCheckOptions {
  /** Minimum supported Node major (default 18 — RN 0.7x requires 20, so 18-19 warn). */
  minNodeMajor?: number
  /** Minimum supported JDK major (default 17 for RN 0.7x). */
  minJavaMajor?: number
  /** Metro dev-server port (default 8081). */
  metroPort?: number
}

/**
 * Binaries that are installed globally / via gem / via curl (no npm package
 * resolvable from the project), probed by name with `--version` or `--help`.
 */
const GLOBAL_BIN_PROBE: Record<string, string[]> = {
  fastlane: ['--version'],
  maestro: ['--help'],
  'eas-cli': ['--version'],
}

/** Skills install into .vectalon/skills/<id> or .agents/skills/<id>. */
function skillInstallDirs(root: string, item: EcosystemItem): string[] {
  const dirs = [
    join(root, '.vectalon', 'skills', item.id),
    join(root, '.agents', 'skills', item.id),
  ]
  if (item.configPath) {
    dirs.push(join(root, item.configPath))
  }
  return dirs
}

/** Extract the npm package name from an npx-style install string. */
function packageFromInstall(install: string): string | null {
  const match = install.match(/^npx(?:\s+\S+)?\s+(@?[\w.-]+(?:\/[\w.-]+)?)/)
  return match ? match[1] : null
}

function hintForInstall(install: string): string {
  return `Install with: ${install}`
}

/**
 * Check a single ecosystem item. Category-specific rules:
 * - mcp: the npx package must be resolvable locally, or the npx binary must
 *   respond to a version/help probe (bounded); otherwise missing.
 * - tool/hook: npm package must be installed locally, unless it's a
 *   global-binary tool (fastlane/maestro/eas-cli) probed on PATH.
 * - skill: the skill's install directory must exist.
 */
export function checkEcosystemItem(
  item: EcosystemItem,
  root: string,
  checkers: DoctorCheckers
): DoctorCheckResult {
  const base = { id: item.id, name: item.name, category: item.category, flavor: item.flavor }

  if (item.category === 'skill') {
    const dirs = skillInstallDirs(root, item)
    const installed = dirs.some(d => checkers.dirExists(d))
    if (installed) {
      return { ...base, status: 'ok', detail: 'skill install directory present' }
    }
    return {
      ...base,
      status: 'missing',
      detail: `no skill directory found under ${dirs.map(d => d.replace(root, '.')).join(' or ')}`,
      hint: hintForInstall(item.install),
    }
  }

  // expo-mcp runs through the expo CLI (`npx expo mcp`), not a standalone npm
  // package, so verify the expo CLI/package instead of resolving "expo-mcp".
  if (item.id === 'expo-mcp') {
    if (checkers.packageInstalled('expo')) {
      return { ...base, status: 'ok', detail: 'expo package installed locally (npx expo mcp available)' }
    }
    const result = checkers.run('expo', ['--version'])
    if (result.success) {
      return { ...base, status: 'ok', detail: 'expo CLI responds on PATH' }
    }
    return {
      ...base,
      status: 'missing',
      detail: 'expo CLI not found — npx expo mcp requires the expo package',
      hint: hintForInstall(item.install),
    }
  }

  // mcp + tool + hook all resolve an npm package when one is known.
  const packageName = item.packageName || packageFromInstall(item.install)
  if (packageName) {
    if (checkers.packageInstalled(packageName)) {
      return { ...base, status: 'ok', detail: `${packageName} installed locally` }
    }
    // npx-only tools are fetch-on-demand; still try a bounded binary probe.
    const probe = GLOBAL_BIN_PROBE[item.id]
    if (item.install.startsWith('npx') || probe) {
      const binName = probe ? item.id : packageName
      const args = probe || ['--version']
      const result = checkers.run(binName, args)
      if (result.success) {
        return { ...base, status: 'ok', detail: `${binName} responds on PATH` }
      }
      return {
        ...base,
        status: 'missing',
        detail: `${packageName} not installed locally and ${binName} did not respond`,
        hint: hintForInstall(item.install),
      }
    }
    return {
      ...base,
      status: 'missing',
      detail: `${packageName} not installed locally`,
      hint: hintForInstall(item.install),
    }
  }

  // No npm package: global binaries only.
  const probe = GLOBAL_BIN_PROBE[item.id]
  if (probe) {
    const result = checkers.run(item.id, probe)
    if (result.success) {
      return { ...base, status: 'ok', detail: `${item.id} responds on PATH` }
    }
    return {
      ...base,
      status: 'missing',
      detail: `${item.id} not found on PATH`,
      hint: hintForInstall(item.install),
    }
  }

  return {
    ...base,
    status: 'warning',
    detail: 'no automated check available for this item',
    hint: hintForInstall(item.install),
  }
}

/** Run the doctor over every enabled ecosystem item in the project. */
export function runEcosystemDoctor(root: string, checkers: DoctorCheckers): DoctorReport {
  const config = readEcosystemConfig(root)
  const enabled = listEcosystemItems().filter(i => config.enabled.includes(i.id))

  const checks = enabled.map(item => checkEcosystemItem(item, root, checkers))

  return {
    checks,
    toolchain: [],
    enabledCount: enabled.length,
    okCount: checks.filter(c => c.status === 'ok').length,
    missingCount: checks.filter(c => c.status === 'missing').length,
    warningCount: checks.filter(c => c.status === 'warning').length,
  }
}

/**
 * Base fields shared by every native toolchain check (mirrors checkEcosystemItem's
 * `base` pattern).
 */
function toolchainBase(id: string, name: string): Pick<DoctorCheckResult, 'id' | 'name' | 'category' | 'flavor'> {
  return { id, name, category: 'toolchain', flavor: 'both' }
}

/**
 * Check the native toolchain a React Native project needs: Node, a JDK,
 * Android SDK + emulator, Xcode + CocoaPods (macOS), and the Metro dev-server
 * port. Each check returns an actionable fix hint on failure.
 *
 * Platform- and project-aware:
 * - Xcode/CocoaPods are only meaningful on darwin.
 * - Android checks degrade to a warning when the project has no android/ dir.
 * - Metro is a warning (not a failure) when nothing is listening — the dev
 *   server is started on demand.
 */
export function checkNativeToolchain(
  root: string,
  checkers: DoctorCheckers,
  options: ToolchainCheckOptions = {}
): DoctorCheckResult[] {
  const minNodeMajor = options.minNodeMajor ?? 18
  const minJavaMajor = options.minJavaMajor ?? 17
  const metroPort = options.metroPort ?? 8081
  const androidPresent = checkers.dirExists(join(root, 'android'))
  const macOnly = checkers.platform === 'darwin'

  const results: DoctorCheckResult[] = []

  // Node.js
  const node = checkers.run('node', ['--version'])
  const nodeMajor = node.success ? parseInt((node.output.match(/v?(\d+)/) || [])[1] || '', 10) : NaN
  if (!node.success || Number.isNaN(nodeMajor)) {
    results.push({
      ...toolchainBase('node', 'Node.js'),
      status: 'missing',
      detail: node.success ? 'could not parse node version' : 'node not found on PATH',
      hint: 'Install Node 20+ via nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`, then `nvm install 20`',
    })
  } else if (nodeMajor < minNodeMajor) {
    results.push({
      ...toolchainBase('node', 'Node.js'),
      status: 'missing',
      detail: `Node ${nodeMajor} is too old (RN 0.7x requires ${minNodeMajor}+)`,
      hint: 'Upgrade Node: `nvm install 20 && nvm use 20`',
    })
  } else if (nodeMajor < 20) {
    results.push({
      ...toolchainBase('node', 'Node.js'),
      status: 'warning',
      detail: `Node ${nodeMajor} works but 20+ is recommended for RN 0.7x`,
      hint: 'Upgrade Node: `nvm install 20 && nvm use 20`',
    })
  } else {
    results.push({ ...toolchainBase('node', 'Node.js'), status: 'ok', detail: `Node ${nodeMajor}` })
  }

  // JDK
  const java = checkers.run('java', ['-version'])
  const javaMajor = java.success ? parseInt((java.output.match(/(?:version\s+"|openjdk\s+)?(\d+)/) || [])[1] || '', 10) : NaN
  if (!java.success || Number.isNaN(javaMajor)) {
    results.push({
      ...toolchainBase('jdk', 'JDK'),
      status: 'missing',
      detail: java.success ? 'could not parse java version' : 'java not found on PATH',
      hint: 'Install a JDK 17+ (RN Android builds need it): `brew install --cask temurin@17` (macOS) or download from Adoptium',
    })
  } else if (javaMajor < minJavaMajor) {
    results.push({
      ...toolchainBase('jdk', 'JDK'),
      status: 'missing',
      detail: `JDK ${javaMajor} is too old (RN requires ${minJavaMajor}+)`,
      hint: `Upgrade the JDK: install ${minJavaMajor}+ from Adoptium or \`brew install --cask temurin@${minJavaMajor}\``,
    })
  } else {
    results.push({ ...toolchainBase('jdk', 'JDK'), status: 'ok', detail: `JDK ${javaMajor}` })
  }

  // Android SDK
  const androidHome = checkers.env('ANDROID_HOME') || checkers.env('ANDROID_SDK_ROOT')
  const sdkFound = androidHome ? checkers.dirExists(androidHome) : false
  const adbOnPath = checkers.run('adb', ['--version']).success
  if (sdkFound) {
    results.push({ ...toolchainBase('android-sdk', 'Android SDK'), status: 'ok', detail: `Android SDK at ${androidHome}` })
  } else if (adbOnPath) {
    results.push({ ...toolchainBase('android-sdk', 'Android SDK'), status: 'ok', detail: 'Android SDK tools (adb) on PATH' })
  } else if (androidPresent) {
    results.push({
      ...toolchainBase('android-sdk', 'Android SDK'),
      status: 'missing',
      detail: 'ANDROID_HOME unset and adb not on PATH (android/ present)',
      hint: 'Install Android Studio and export ANDROID_HOME (e.g. `export ANDROID_HOME=$HOME/Library/Android/sdk`)',
    })
  } else {
    results.push({
      ...toolchainBase('android-sdk', 'Android SDK'),
      status: 'warning',
      detail: 'ANDROID_HOME unset and adb not on PATH (no android/ dir — Android not built here)',
      hint: 'Install Android Studio and export ANDROID_HOME before building Android',
    })
  }

  // Android emulator
  const emulator = checkers.run('emulator', ['-list-avds'])
  if (emulator.success && emulator.output.trim().length > 0) {
    const avds = emulator.output.trim().split(/\r?\n/).filter(Boolean).join(', ')
    results.push({ ...toolchainBase('android-emulator', 'Android Emulator'), status: 'ok', detail: `AVDs: ${avds}` })
  } else if (androidPresent) {
    results.push({
      ...toolchainBase('android-emulator', 'Android Emulator'),
      status: 'missing',
      detail: emulator.success ? 'emulator found but no AVDs configured' : 'emulator not found on PATH (android/ present)',
      hint: 'Create an AVD in Android Studio (Device Manager) or `avdmanager create avd -n dev -k "system-images;android-35;google_apis;arm64-v8a"`',
    })
  } else {
    results.push({
      ...toolchainBase('android-emulator', 'Android Emulator'),
      status: 'warning',
      detail: 'no emulator on PATH (no android/ dir — not built here)',
      hint: 'Install the emulator + system image via Android Studio SDK Manager',
    })
  }

  // Xcode (macOS only)
  if (!macOnly) {
    results.push({ ...toolchainBase('xcode', 'Xcode'), status: 'warning', detail: 'Xcode is macOS-only — skipped' })
  } else {
    const xcode = checkers.run('xcodebuild', ['-version'])
    if (xcode.success) {
      const version = (xcode.output.match(/Xcode (\S+)/) || [])[1] || xcode.output.trim()
      results.push({ ...toolchainBase('xcode', 'Xcode'), status: 'ok', detail: `Xcode ${version}` })
    } else {
      results.push({
        ...toolchainBase('xcode', 'Xcode'),
        status: 'missing',
        detail: 'xcodebuild not found',
        hint: 'Install Xcode from the App Store, then `xcode-select --switch /Applications/Xcode.app`',
      })
    }
  }

  // CocoaPods (macOS only, iOS builds)
  if (!macOnly) {
    results.push({ ...toolchainBase('cocoapods', 'CocoaPods'), status: 'warning', detail: 'CocoaPods is macOS-only — skipped' })
  } else {
    const pod = checkers.run('pod', ['--version'])
    if (pod.success) {
      results.push({ ...toolchainBase('cocoapods', 'CocoaPods'), status: 'ok', detail: `CocoaPods ${pod.output.trim()}` })
    } else {
      results.push({
        ...toolchainBase('cocoapods', 'CocoaPods'),
        status: 'missing',
        detail: 'pod not found on PATH',
        hint: 'Install CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`)',
      })
    }
  }

  // Metro dev server port
  if (checkers.portOpen(metroPort)) {
    results.push({ ...toolchainBase('metro-port', `Metro (port ${metroPort})`), status: 'ok', detail: `Dev server listening on port ${metroPort}` })
  } else {
    results.push({
      ...toolchainBase('metro-port', `Metro (port ${metroPort})`),
      status: 'warning',
      detail: `Nothing listening on port ${metroPort}`,
      hint: 'Start the dev server: `npm start` / `npx react-native start`',
    })
  }

  return results
}

/** Run the full doctor: enabled ecosystem items + the native toolchain. */
export function runDoctor(
  root: string,
  checkers: DoctorCheckers,
  options?: ToolchainCheckOptions
): DoctorReport {
  const ecosystem = runEcosystemDoctor(root, checkers)
  const toolchain = checkNativeToolchain(root, checkers, options)
  const all = [...ecosystem.checks, ...toolchain]
  return {
    ...ecosystem,
    toolchain,
    okCount: all.filter(c => c.status === 'ok').length,
    missingCount: all.filter(c => c.status === 'missing').length,
    warningCount: all.filter(c => c.status === 'warning').length,
  }
}
