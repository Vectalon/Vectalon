/**
 * Sandbox backends — detection + OS profile construction
 * Business Source License 1.1 (BSL-1.1)
 *
 * Three tiers of isolation, strongest first:
 *
 *  1. `sandbox-exec` (macOS) — an SBPL seatbelt profile restricts file writes
 *     to the sandbox root and denies outbound network by default. This is the
 *     real "no filesystem/network outside the sandbox" guarantee on macOS.
 *  2. `bwrap` (bubblewrap, Linux) — `--unshare-net` denies network and the
 *     read-only root bind confines writes to the sandbox root.
 *  3. `process` — no OS confinement; we still scrub the environment, apply
 *     rlimits via the ulimit wrapper, and run with the sandbox root as cwd.
 *
 * Detection is lazy (one stat/spawn per process) and degrades gracefully:
 * when no OS backend exists the caller gets `process` with an honest report
 * that writes/network are not OS-enforced.
 */

import { existsSync } from 'fs'
import { platform } from 'os'
import { resolve } from 'path'
import { spawnSync } from 'child_process'
import type { IsolationLevel, SandboxBackend } from './types'

let cached: SandboxBackend | null = null

/** Detect the strongest isolation backend available on this machine. */
export function detectBackend(): SandboxBackend {
  if (cached) return cached

  if (platform() === 'darwin' && existsSync('/usr/bin/sandbox-exec')) {
    cached = { isolation: 'sandbox-exec', canDenyNetwork: true, canConfineWrites: true }
    return cached
  }

  if (platform() === 'linux' && commandExists('bwrap')) {
    cached = { isolation: 'bwrap', canDenyNetwork: true, canConfineWrites: true }
    return cached
  }

  cached = { isolation: 'process', canDenyNetwork: false, canConfineWrites: false }
  return cached
}

/** Reset the cached backend (used by tests to force re-detection). */
export function resetBackendCache(): void {
  cached = null
}

function commandExists(command: string): boolean {
  try {
    const result = spawnSync('sh', ['-c', `command -v ${command} >/dev/null 2>&1`], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Build an SBPL seatbelt profile for `sandbox-exec`:
 * - deny-by-default, then import the system profile for normal process behavior
 * - allow reads anywhere, but writes only inside the sandbox root + tmp
 * - deny outbound network unless `network` is true
 */
export function buildMacProfile(root: string, network: boolean): string {
  const escapedRoot = resolve(root).replace(/"/g, '\\"')
  const networkRule = network ? '(allow network*)' : '(deny network*)'
  return [
    '(version 1)',
    '(deny default)',
    '(import "system.sb")',
    '(allow process*)',
    '(allow file-read*)',
    `(allow file-write* (subpath "${escapedRoot}") (subpath "/private/tmp") (subpath "/dev/null") (subpath "/tmp"))`,
    '(allow sysctl-read)',
    networkRule,
  ].join('\n')
}

/**
 * Build the bubblewrap argument vector (excluding the command itself):
 * deny network, make the whole filesystem read-only, then re-bind the sandbox
 * root as the only writable location.
 */
export function buildBwrapArgs(root: string, network: boolean): string[] {
  const args = ['--die-with-parent']
  if (!network) args.push('--unshare-net')
  args.push(
    '--ro-bind', '/', '/',
    '--bind', resolve(root), resolve(root),
    '--proc', '/proc',
    '--dev', '/dev',
  )
  return args
}

export type { IsolationLevel }
