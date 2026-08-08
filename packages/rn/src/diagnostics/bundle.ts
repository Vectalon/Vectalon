/**
 * --diagnostics bundle (P0-2)
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vectalon <command> --diagnostics` captures: Node version, OS, RN/Expo
 * versions, model provider used, the full stack trace (when the command
 * failed), the last 5000 log lines, and the state of `.vectalon/` — written to
 * a single `.vectalon/diagnostics-bundle.json` users can paste into support
 * tickets (or auto-upload via `vectalon support --upload`).
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, relative } from 'path'
import { platform, release, arch } from 'os'
import { getLogLines } from '../cli/logger'
import { configDirPath } from '../config'
import { readProjectManifest } from '../projectManifest'
import { reportError } from '../utils/safe'
import type { DiagnosticsBundle } from './types'

export interface CollectDiagnosticsOptions {
  command: string
  root?: string
  /** Full stack trace captured under --diagnostics when the command failed. */
  errorStack?: string
  maxLogLines?: number
  /** Max .vectalon entries listed (default 500). */
  maxVectalonEntries?: number
  _now?: number
}

/** Best-effort read of a JSON file. */
function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Walk .vectalon/ and return relative path + size (secrets skipped). */
export function listVectalonState(root: string, maxEntries = 500): Array<{ path: string; size: number }> {
  const base = join(root, '.vectalon')
  const entries: Array<{ path: string; size: number }> = []
  const SECRET_NAME = /\.(pem|key|p12)$/i

  const walk = (dir: string): void => {
    if (entries.length >= maxEntries) return
    let children: string[]
    try {
      children = readdirSync(dir)
    } catch {
      return
    }
    for (const name of children) {
      if (entries.length >= maxEntries) return
      if (name === 'node_modules' || name === 'dist') continue
      if (SECRET_NAME.test(name)) continue
      const abs = join(dir, name)
      let stat
      try {
        stat = lstatSync(abs)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        walk(abs)
      } else if (stat.isFile()) {
        entries.push({ path: relative(base, abs), size: stat.size })
      }
    }
  }

  if (existsSync(base)) walk(base)
  return entries
}

/** Detect the project flavor from package.json deps. */
export function detectProjectTypeFromPkg(pkgJson: Record<string, unknown> | null): 'expo' | 'rn-cli' | 'unknown' {
  const deps = (pkgJson?.dependencies || {}) as Record<string, unknown>
  if (deps.expo) return 'expo'
  if (deps['react-native']) return 'rn-cli'
  return 'unknown'
}

/** Collect the full diagnostics bundle (pure; no network). */
export function collectDiagnosticsBundle(options: CollectDiagnosticsOptions): DiagnosticsBundle {
  const root = options.root || process.cwd()
  const now = options._now ?? Date.now()
  const pkgJson = readJson(join(root, 'package.json'))
  const manifest = readProjectManifest(root)
  const deps = (pkgJson?.dependencies || {}) as Record<string, string>

  const environment: DiagnosticsBundle['environment'] = {
    nodeVersion: process.version,
    os: `${platform()} ${release()} ${arch()}`,
    arch: arch(),
    cwd: root,
    pid: process.pid,
    uptimeMs: process.uptime() * 1000,
  }
  // CPU/RAM are handy for perf-shaped support tickets; kept out of the typed
  // surface but included in the emitted file.
  const bundle: DiagnosticsBundle = {
    schemaVersion: 1,
    command: options.command,
    timestamp: now,
    environment,
    project: {
      rnVersion: deps['react-native'] as string | undefined,
      expoVersion: deps.expo as string | undefined,
      modelProvider: manifest?.modelProvider,
      projectType: detectProjectTypeFromPkg(pkgJson),
      hasVectalonDir: existsSync(join(root, '.vectalon')),
    },
    logLines: getLogLines(options.maxLogLines ?? 5000),
    ...(options.errorStack ? { errorStack: options.errorStack } : {}),
    vectalonState: listVectalonState(root, options.maxVectalonEntries ?? 500),
  }
  return bundle
}

/**
 * Write the bundle; returns the path. Lands in .vectalon/diagnostics-bundle.json
 * when the project has a .vectalon/ dir — otherwise it falls back to the user
 * config dir so a stray .vectalon/ is never created in a non-project directory.
 */
export function writeDiagnosticsBundle(options: CollectDiagnosticsOptions): string {
  const root = options.root || process.cwd()
  const path = existsSync(join(root, '.vectalon'))
    ? join(root, '.vectalon', 'diagnostics-bundle.json')
    : join(configDirPath(), 'diagnostics-bundle.json')
  try {
    mkdirSync(dirname(path), { recursive: true })
    const bundle = collectDiagnosticsBundle(options)
    writeFileSync(path, JSON.stringify(bundle, null, 2))
  } catch (err) {
    reportError(err, 'diagnostics: writing bundle')
  }
  return path
}
