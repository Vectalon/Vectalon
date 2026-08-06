import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { bestEffort, reportError } from '../utils/safe'

/**
 * Monorepo / workspace detection — Phase V-4. Many RN teams run pnpm
 * workspaces, Yarn workspaces, npm workspaces, Turborepo, or Lerna. The
 * scanner previously assumed a single `package.json` at the project root; this
 * module finds the workspace root by walking up from the scanned directory,
 * maps internal packages, and tells the harness where `node_modules` actually
 * lives (pnpm / yarn / npm all hoist to the workspace root by default).
 *
 * Detection signals (first ancestor directory that has any of these wins):
 * - `pnpm-workspace.yaml`   → pnpm workspace
 * - `lerna.json`            → Lerna
 * - `package.json` with a `workspaces` field → Yarn / npm (lockfile decides)
 * - `turbo.json`            → Turborepo (workspaces come from the manifest)
 */

export type WorkspaceManager = 'pnpm' | 'yarn' | 'npm' | 'turborepo' | 'lerna'

export interface WorkspaceInfo {
  /** True when the scanned root is part of a monorepo workspace. */
  isMonorepo: boolean
  /** Detected package manager / orchestrator, or null when not a monorepo. */
  manager: WorkspaceManager | null
  /** Absolute path of the workspace root (may differ from the project root). */
  root: string | null
  /** Workspace glob patterns as declared (e.g. `packages/*`). */
  patterns: string[]
  /** Absolute paths of every workspace member directory that has a package.json. */
  packages: string[]
  /** Internal package name → absolute directory (for dependency mapping). */
  internalPackages: Record<string, string>
  /** True when node_modules is hoisted to the workspace root (default for all managers). */
  hoistedNodeModules: boolean
}

export const NO_WORKSPACE: WorkspaceInfo = {
  isMonorepo: false,
  manager: null,
  root: null,
  patterns: [],
  packages: [],
  internalPackages: {},
  hoistedNodeModules: false,
}

interface WorkspaceMarker {
  manager: WorkspaceManager
  patterns: string[]
}

const YAML_PACKAGES_RE = /^\s*-\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/m
const DEFAULT_PATTERNS = ['packages/*']

/** Parse the `packages:` list out of a pnpm-workspace.yaml (best-effort). */
function parsePnpmWorkspaceYaml(content: string): string[] {
  const match = content.match(/packages:\s*\n([\s\S]*?)(?:\n\w|\n#|$)/)
  if (!match) return DEFAULT_PATTERNS
  const patterns = match[1]
    .split('\n')
    .map(line => line.match(YAML_PACKAGES_RE)?.[1])
    .filter((p): p is string => !!p && !p.startsWith('!'))
  return patterns.length > 0 ? patterns : DEFAULT_PATTERNS
}

/** Read the `workspaces` field from a root manifest (string array or `{ packages: [] }`). */
function workspacesFromManifest(pkg: Record<string, unknown>): string[] {
  const ws = pkg.workspaces
  if (Array.isArray(ws)) {
    return ws.filter((p): p is string => typeof p === 'string' && !p.startsWith('!'))
  }
  if (ws && typeof ws === 'object') {
    const pkgs = (ws as { packages?: unknown }).packages
    if (Array.isArray(pkgs)) {
      return pkgs.filter((p): p is string => typeof p === 'string' && !p.startsWith('!'))
    }
  }
  return []
}

/** Detect the workspace marker present in a directory, if any. */
function detectMarker(dir: string): WorkspaceMarker | null {
  const pnpmYaml = join(dir, 'pnpm-workspace.yaml')
  if (existsSync(pnpmYaml)) {
    try {
      return { manager: 'pnpm', patterns: parsePnpmWorkspaceYaml(readFileSync(pnpmYaml, 'utf-8')) }
    } catch (err) {
      reportError(err, 'workspace: parsing pnpm-workspace.yaml')
      return { manager: 'pnpm', patterns: DEFAULT_PATTERNS }
    }
  }

  const lernaJson = join(dir, 'lerna.json')
  if (existsSync(lernaJson)) {
    try {
      const cfg = JSON.parse(readFileSync(lernaJson, 'utf-8')) as { packages?: string[] }
      return { manager: 'lerna', patterns: cfg.packages?.length ? cfg.packages : DEFAULT_PATTERNS }
    } catch (err) {
      reportError(err, 'workspace: parsing lerna.json')
      return { manager: 'lerna', patterns: DEFAULT_PATTERNS }
    }
  }

  // Turborepo is an orchestrator; the workspace layout comes from the
  // manifest's `workspaces` field (or pnpm-workspace.yaml). Prefer the turbo
  // label when present — it is the most actionable signal for the prompt.
  if (existsSync(join(dir, 'turbo.json'))) {
    const pkgPath2 = join(dir, 'package.json')
    let patterns = DEFAULT_PATTERNS
    if (existsSync(pkgPath2)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath2, 'utf-8')) as { workspaces?: unknown }
        const ws = workspacesFromManifest(pkg)
        if (ws.length > 0) patterns = ws
      } catch (err) {
        reportError(err, 'workspace: parsing turbo package.json')
      }
    }
    return { manager: 'turborepo', patterns }
  }

  const pkgPath = join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        workspaces?: unknown
        packageManager?: string
      }
      const patterns = workspacesFromManifest(pkg)
      // A `workspaces` field is the marker; the lockfile / packageManager
      // field then decides yarn vs pnpm vs npm. No workspaces → not a
      // monorepo, even when packageManager pins yarn.
      if (patterns.length > 0) {
        const manager = existsSync(join(dir, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : existsSync(join(dir, 'yarn.lock'))
            ? 'yarn'
            : pkg.packageManager?.startsWith('pnpm')
              ? 'pnpm'
              : pkg.packageManager?.startsWith('yarn')
                ? 'yarn'
                : 'npm'
        return { manager, patterns }
      }
    } catch (err) {
      reportError(err, 'workspace: parsing package.json workspaces field')
    }
  }

  return null
}

/** Walk up from `root` and return the first directory with a workspace marker. */
export function findWorkspaceRoot(root: string): string | null {
  let dir = root
  // Clamp the walk so we never escape into unrelated mounts on the machine.
  for (let depth = 0; depth < 20; depth++) {
    if (detectMarker(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/** Expand a workspace glob (`packages/*`, `apps/**`, `libs/foo`) into directories. */
export function expandWorkspaceGlob(baseDir: string, pattern: string): string[] {
  const segments = pattern.split('/').filter(Boolean)
  let dirs: string[] = [baseDir]
  for (const segment of segments) {
    const next: string[] = []
    for (const dir of dirs) {
      if (segment === '**') {
        // Recursive — this dir and everything below, then continue matching
        // the remaining segments inside each (handled by the loop).
        next.push(dir)
        const walk = (d: string): void => {
          for (const entry of readdirSafe(d)) {
            const full = join(d, entry)
            if (isDir(full)) {
              next.push(full)
              walk(full)
            }
          }
        }
        walk(dir)
      } else if (segment === '*') {
        for (const entry of readdirSafe(dir)) {
          const full = join(dir, entry)
          if (isDir(full) && !entry.startsWith('.')) next.push(full)
        }
      } else {
        const full = join(dir, segment)
        if (isDir(full)) next.push(full)
      }
    }
    dirs = [...new Set(next)]
    if (dirs.length === 0) return []
  }
  return dirs.filter(d => existsSync(join(d, 'package.json')))
}

function readdirSafe(dir: string): string[] {
  return bestEffort(() => readdirSync(dir), `workspace: reading directory ${dir}`) ?? []
}

function isDir(p: string): boolean {
  return bestEffort(() => statSync(p).isDirectory(), `workspace: statting ${p}`) ?? false
}

/** Read a package.json's name from a directory, or null. */
function packageNameAt(dir: string): string | null {
  return bestEffort(() => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { name?: string }
    return pkg.name || null
  }, `workspace: reading package.json in ${dir}`) ?? null
}

/** Detect the workspace the scanned root belongs to (walk-up from `root`). */
export function detectWorkspace(root: string): WorkspaceInfo {
  const wsRoot = findWorkspaceRoot(root)
  if (!wsRoot) return NO_WORKSPACE

  const marker = detectMarker(wsRoot)
  const patterns = marker?.patterns ?? DEFAULT_PATTERNS

  const memberDirs = new Set<string>()
  for (const pattern of patterns) {
    for (const dir of expandWorkspaceGlob(wsRoot, pattern)) {
      memberDirs.add(dir)
    }
  }

  const packages: string[] = []
  const internalPackages: Record<string, string> = {}
  for (const dir of [...memberDirs].sort()) {
    const name = packageNameAt(dir)
    if (!name) continue
    packages.push(dir)
    internalPackages[name] = dir
  }

  return {
    isMonorepo: true,
    manager: marker?.manager ?? null,
    root: wsRoot,
    patterns,
    packages,
    internalPackages,
    hoistedNodeModules: true,
  }
}

/**
 * Where node_modules actually lives. In a monorepo the hoisted store is at the
 * workspace root; standalone projects keep it at the project root. Returns the
 * hoisted root when present, otherwise the local one.
 */
export function resolveNodeModulesRoot(projectRoot: string): string {
  const ws = detectWorkspace(projectRoot)
  if (ws.isMonorepo && ws.root) {
    const hoisted = join(ws.root, 'node_modules')
    if (existsSync(hoisted)) return hoisted
  }
  return join(projectRoot, 'node_modules')
}

/** The react-native version resolved from this package or the workspace root manifest. */
export function resolveReactNativeVersion(projectRoot: string, localDeps: Record<string, string>): string {
  if (localDeps['react-native']) return localDeps['react-native']
  const ws = detectWorkspace(projectRoot)
  if (ws.isMonorepo && ws.root) {
    try {
      const pkg = JSON.parse(readFileSync(join(ws.root, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      return pkg.dependencies?.['react-native'] || pkg.devDependencies?.['react-native'] || ''
    } catch (err) {
      reportError(err, 'workspace: reading react-native version from workspace root')
      return ''
    }
  }
  return ''
}
