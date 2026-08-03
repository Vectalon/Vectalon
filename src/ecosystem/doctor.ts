import { join } from 'path'
import { listEcosystemItems } from './catalog'
import { readEcosystemConfig } from './config'
import type { EcosystemItem } from './types'

export type DoctorStatus = 'ok' | 'missing' | 'warning'

export interface DoctorCheckResult {
  id: string
  name: string
  category: EcosystemItem['category']
  flavor: string
  status: DoctorStatus
  detail: string
  hint?: string
}

export interface DoctorReport {
  checks: DoctorCheckResult[]
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
    enabledCount: enabled.length,
    okCount: checks.filter(c => c.status === 'ok').length,
    missingCount: checks.filter(c => c.status === 'missing').length,
    warningCount: checks.filter(c => c.status === 'warning').length,
  }
}
