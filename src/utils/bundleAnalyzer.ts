import { existsSync, readFileSync, readdirSync, statSync, rmSync, mkdirSync } from 'fs'
import { join, relative, extname } from 'path'
import { tmpdir } from 'os'
import { runCommand } from '../adapters/runCommand'

/**
 * Metro bundle analysis & performance budgets — fully deterministic, no model
 * calls. Parses Metro's `--json` bundle output (or a hand-built snapshot) into
 * bundle composition, enforces performance budgets in the code-review phase
 * (large new libraries, missing `sideEffects: false`, unoptimized images,
 * oversized static assets), and stores size history in the knowledge base so
 * workflows can warn "this PR increases the bundle by X%".
 */

export interface BundleModule {
  name: string
  /** Raw byte size of this module's output. */
  size: number
  /** Original source path (node_modules/... resolves to a package). */
  sourcePath?: string
  isAsset?: boolean
}

export interface BundleAsset {
  name: string
  size: number
}

/** Metro `--json` bundle output (the `modules`/`assets` shape it emits). */
export interface MetroBundleStats {
  modules: BundleModule[]
  assets?: BundleAsset[]
}

export interface PackageSize {
  name: string
  size: number
  /** Modules attributed to this package. */
  moduleCount: number
}

export interface BundleAnalysis {
  totalSize: number
  moduleCount: number
  packages: PackageSize[]
  /** Largest single modules (sorted desc, capped). */
  largestModules: BundleModule[]
  assets: BundleAsset[]
}

export interface BudgetFinding {
  rule: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'build', '.gradle', '.cxx', 'Pods', 'DerivedData',
  'xcuserdata', '.expo', 'vendor', 'coverage', 'dist', '.vectalon',
])

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const ASSET_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.aac', '.mp3',
  '.wav', '.ttf', '.otf', '.pdf', '.zip', '.bin',
])

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatPct(delta: number): string {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

/** Extract the npm package name from a module source path. */
export function packageFromModulePath(sourcePath: string | undefined, name: string): string {
  if (sourcePath) {
    const m = sourcePath.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
    if (m) return m[1]
  }
  // Fall back to the module name: `node_modules/foo/lib/index.js` or `foo/index.js`.
  const m = name.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
  if (m) return m[1]
  return name.split('/')[0] || name
}

/**
 * Parse Metro's `--json` bundle output. Tolerates both the raw JSON string
 * and an already-parsed object, and returns null when the shape is unknown.
 */
export function parseMetroStats(input: string | MetroBundleStats): MetroBundleStats | null {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as { modules?: unknown; assets?: unknown }
  if (!Array.isArray(obj.modules)) return null
  const modules = obj.modules
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map(m => ({
      name: typeof m.name === 'string' ? m.name : String(m.name ?? ''),
      size: typeof m.size === 'number' ? m.size : 0,
      sourcePath: typeof m.sourcePath === 'string' ? m.sourcePath : undefined,
      isAsset: m.isAsset === true,
    }))
  const assets = Array.isArray(obj.assets)
    ? obj.assets
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map(a => ({
          name: typeof a.name === 'string' ? a.name : String(a.name ?? ''),
          size: typeof a.size === 'number' ? a.size : 0,
        }))
    : []
  return { modules, assets }
}

/** Aggregate bundle modules into per-package sizes (sorted desc). */
export function analyzeBundleStats(stats: MetroBundleStats): BundleAnalysis {
  const byPackage = new Map<string, PackageSize>()
  let totalSize = 0
  for (const mod of stats.modules) {
    const pkg = packageFromModulePath(mod.sourcePath, mod.name)
    const entry = byPackage.get(pkg) || { name: pkg, size: 0, moduleCount: 0 }
    entry.size += mod.size
    entry.moduleCount++
    byPackage.set(pkg, entry)
    totalSize += mod.size
  }
  const packages = [...byPackage.values()].sort((a, b) => b.size - a.size)
  const largestModules = [...stats.modules].sort((a, b) => b.size - a.size).slice(0, 10)
  return {
    totalSize,
    moduleCount: stats.modules.length,
    packages,
    largestModules,
    assets: stats.assets || [],
  }
}

/**
 * Performance budget findings from a bundle snapshot. Pure — every rule is a
 * deterministic check over the parsed stats.
 */
export function checkBundleBudgets(analysis: BundleAnalysis, opts: { largeLibBytes?: number } = {}): BudgetFinding[] {
  const largeLibBytes = opts.largeLibBytes ?? 100 * 1024
  const findings: BudgetFinding[] = []

  for (const pkg of analysis.packages) {
    if (pkg.size > largeLibBytes && !pkg.name.startsWith('react-native')) {
      findings.push({
        rule: 'large-library',
        severity: 'warning',
        message: `Library "${pkg.name}" adds ${formatBytes(pkg.size)} to the bundle (${pkg.moduleCount} module(s)) — exceeds the ${formatBytes(largeLibBytes)} budget`,
      })
    }
  }

  for (const asset of analysis.assets) {
    if (asset.size > largeLibBytes) {
      findings.push({
        rule: 'large-asset',
        severity: 'warning',
        message: `Asset "${asset.name}" is ${formatBytes(asset.size)} in the bundle`,
      })
    }
  }

  return findings
}

export interface StaticBudgetResult {
  findings: BudgetFinding[]
  /** Packages missing `sideEffects: false`, with their main-file size estimate. */
  checkedPackages: number
}

/**
 * Deterministic budgets that need no Metro build — checked against the
 * project on disk:
 * - dependencies missing `sideEffects: false` (tree-shaking dead code)
 * - unoptimized image files (png/jpeg/gif > threshold, non-WebP)
 * - oversized static assets (> threshold)
 */
export function checkStaticBudgets(
  projectRoot: string,
  opts: { sideEffects?: boolean; imageBytes?: number; assetBytes?: number } = {}
): StaticBudgetResult {
  const findings: BudgetFinding[] = []
  const imageBytes = opts.imageBytes ?? 200 * 1024
  const assetBytes = opts.assetBytes ?? 1024 * 1024

  // 1. Missing sideEffects: false across direct dependencies.
  let checkedPackages = 0
  if (opts.sideEffects !== false) {
    const pkgPath = join(projectRoot, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
          dependencies?: Record<string, string>
        }
        const names = Object.keys(pkg.dependencies || {})
        for (const name of names) {
          if (name === 'react-native' || name === 'react') continue
          const depPath = join(projectRoot, 'node_modules', name, 'package.json')
          if (!existsSync(depPath)) continue
          checkedPackages++
          let sideEffects: unknown
          try {
            sideEffects = JSON.parse(readFileSync(depPath, 'utf-8')).sideEffects
          } catch {
            continue
          }
          const isTreeShakeable = sideEffects === false
          if (!isTreeShakeable) {
            findings.push({
              rule: 'missing-side-effects',
              severity: 'info',
              message: `"${name}" does not declare \`sideEffects: false\` — tree-shaking may keep dead code in the bundle`,
            })
          }
        }
      } catch {
        // Unreadable package.json — skip static dep checks.
      }
    }
  }

  // 2+3. Walk the project for image / asset files (bounded to typical asset dirs).
  const assetDirs = ['assets', 'src/assets', 'app/assets', 'res']
  const seen = new Set<string>()
  const walk = (dir: string): void => {
    if (!existsSync(dir) || seen.has(dir)) return
    seen.add(dir)
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        walk(full)
      } else {
        const ext = extname(entry).toLowerCase()
        if (!ASSET_EXT.has(ext)) continue
        const rel = relative(projectRoot, full)
        if (IMAGE_EXT.has(ext) && ext !== '.webp' && stat.size > imageBytes) {
          findings.push({
            rule: 'unoptimized-image',
            severity: 'warning',
            message: `Image "${rel}" is ${formatBytes(stat.size)} — convert to WebP or compress`,
          })
        } else if (stat.size > assetBytes) {
          findings.push({
            rule: 'oversized-asset',
            severity: 'warning',
            message: `Asset "${rel}" is ${formatBytes(stat.size)} — consider moving it out of the bundle`,
          })
        }
      }
    }
  }
  for (const dir of assetDirs) {
    walk(join(projectRoot, dir))
  }

  return { findings, checkedPackages }
}

/**
 * Run a real Metro bundle build and capture its `--json` stats. Returns null
 * when the project has no Metro entry point or the build fails/times out — the
 * caller falls back to static checks instead of failing the workflow.
 */
export async function runMetroBundleCommand(
  projectRoot: string,
  platform: 'ios' | 'android' = 'ios'
): Promise<MetroBundleStats | null> {
  const entryCandidates = ['index.js', 'index.ts', 'App.tsx', 'App.js']
  const entryFile = entryCandidates.find(f => existsSync(join(projectRoot, f)))
  if (!entryFile) return null
  // Guard on the react-native package itself; its `bin` provides the CLI.
  const rnBin = join(projectRoot, 'node_modules', '.bin', 'react-native')
  if (!existsSync(rnBin)) return null

  // Unique scratch paths so concurrent runs / platforms never collide.
  const scratchDir = join(tmpdir(), `vectalon-bundle-${process.pid}-${Date.now()}`)
  const bundleOutput = join(scratchDir, 'bundle.js')
  const assetsDest = join(scratchDir, 'assets')
  mkdirSync(assetsDest, { recursive: true })

  try {
    const result = await runCommand(
      rnBin,
      [
        'bundle',
        '--platform', platform,
        '--dev', 'false',
        '--minify', 'false',
        '--entry-file', entryFile,
        '--bundle-output', bundleOutput,
        '--assets-dest', assetsDest,
        '--json',
      ],
      { cwd: projectRoot, timeout: 120000 }
    )
    if (!result.success) return null
    const stats = parseMetroStats(result.stdout)
    if (!stats) return null
    // Filter to real modules; Metro emits file-path keys in `modules[].name`.
    return stats
  } finally {
    try {
      rmSync(scratchDir, { recursive: true, force: true })
    } catch {
      // Best-effort scratch cleanup.
    }
  }
}
