/**
 * Project Intelligence as the foundation (P0): the canonical, cached model
 * every agent consumes instead of independently rediscovering the repository.
 * Business Source License 1.1 (BSL-1.1)
 *
 * `readProjectIntel` is the single door: it returns the committed
 * `docs/vectalon/intel/report.json` when it is fresh (default 15 min), and
 * otherwise re-runs the full `runProjectIntel` pass once per process — so N
 * agents in one run share one scan, and a stale model is never silently used.
 * Consumers (fix, review, upgrade, …) derive their context from this model
 * and fall back to direct reads only when the model is genuinely unavailable.
 *
 * `buildApplicationModel` derives the "application" digest — screens,
 * navigation, state, native modules, dependencies, source, architecture —
 * the view that makes Vectalon irreplaceable: a generic coding agent sees
 * files; Vectalon sees an application.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import { intelDocsDir, runProjectIntel } from './index'
import type { IntelReport } from './types'

export const INTEL_MAX_AGE_DEFAULT_MS = 15 * 60_000

export interface ProjectIntelAccess {
  report: IntelReport | null
  fromCache: boolean
  reason: 'cached' | 'fresh' | 'unavailable'
}

/** One scan per (root, maxAge) per process — agents in a single run share it. */
const memo = new Map<string, ProjectIntelAccess>()

function memoKey(root: string, maxAgeMs: number): string {
  return `${root}\u0000${maxAgeMs}`
}

function tryReadCached(root: string): IntelReport | null {
  try {
    const p = join(intelDocsDir(root), 'report.json')
    if (!existsSync(p)) return null
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as IntelReport
    if (!parsed || typeof parsed.generatedAt !== 'string' || !parsed.manifest) return null
    return parsed
  } catch (err) {
    reportError(err, 'intel: reading cached model')
    return null
  }
}

/**
 * The one door. Returns the cached model when fresh (or forces a fresh pass
 * with `maxAgeMs: 0` — what diff-analysis agents like upgrade-impact want),
 * re-runs `runProjectIntel` once per process when stale, and never throws:
 * a broken scan degrades to `report: null`, which consumers fall back from.
 */
export function readProjectIntel(root: string, opts: { maxAgeMs?: number } = {}): ProjectIntelAccess {
  const maxAgeMs = opts.maxAgeMs ?? INTEL_MAX_AGE_DEFAULT_MS
  const key = memoKey(root, maxAgeMs)
  const hit = memo.get(key)
  if (hit) return hit

  let access: ProjectIntelAccess
  const cached = tryReadCached(root)
  if (cached) {
    const ageMs = Date.now() - Date.parse(cached.generatedAt)
    if (ageMs <= maxAgeMs) {
      access = { report: cached, fromCache: true, reason: 'cached' }
      memo.set(key, access)
      return access
    }
  }

  try {
    const { report } = runProjectIntel(root)
    access = { report, fromCache: false, reason: 'fresh' }
  } catch (err) {
    reportError(err, 'intel: full scan failed')
    access = { report: cached ?? null, fromCache: false, reason: 'unavailable' }
  }
  memo.set(key, access)
  return access
}

/** The "application" digest — what Vectalon sees that a generic agent cannot. */
export interface ApplicationModel {
  name: string
  rnVersion: string | null
  tooling: 'expo' | 'rn-cli' | null
  expoSdk: string | null
  /** Screens from navigators + expo routes. */
  screens: Array<{ name: string; file: string }>
  navigators: string[]
  expoRoutes: string[]
  stateStores: Array<{ name: string; file: string; kind: string }>
  nativeModules: string[]
  dependencies: Array<{ name: string; version: string; native: boolean }>
  sourceFiles: number
  components: number
  cycles: number
  generatedAt: string
}

export function buildApplicationModel(report: IntelReport): ApplicationModel {
  const { knowledge, navigation, manifest, ast, dependencyGraph } = report

  // Screen names → their component files, via the component graph.
  const componentFile = new Map(knowledge.components.map(c => [c.name, c.filePath]))
  const screens: ApplicationModel['screens'] = []
  const seenScreens = new Set<string>()
  for (const nav of navigation.navigators) {
    for (const s of nav.screens) {
      const file = componentFile.get(s.component) ?? nav.filePath
      const key = `${s.name}\u0000${file}`
      if (seenScreens.has(key)) continue
      seenScreens.add(key)
      screens.push({ name: s.name, file })
    }
  }
  for (const r of navigation.expoRoutes) {
    const name = r.route.replace(/^\/+/, '') || 'index'
    const key = `${name}\u0000${r.filePath}`
    if (seenScreens.has(key)) continue
    seenScreens.add(key)
    screens.push({ name, file: r.filePath })
  }

  const nativeModules = knowledge.nativeModules.flatMap(n => n.modules)
  const dependencies = Object.entries(manifest.dependencies ?? {}).map(([name, version]) => ({
    name,
    version,
    native: /^(react-native-|@react-native|expo-|expo$|react-native$)/.test(name),
  }))

  return {
    name: manifest.projectName,
    rnVersion: manifest.rnVersion || null,
    tooling: manifest.tooling ?? null,
    expoSdk: manifest.expoSdkVersion ?? null,
    screens,
    navigators: navigation.navigators.map(n => n.name),
    expoRoutes: navigation.expoRoutes.map(r => r.route),
    stateStores: knowledge.stores.map(s => ({ name: s.name, file: s.filePath, kind: s.kind })),
    nativeModules,
    dependencies,
    sourceFiles: ast.filesScanned,
    components: knowledge.components.length,
    cycles: dependencyGraph.cycles.length,
    generatedAt: report.generatedAt,
  }
}

/** ASCII "application" tree — the moat visual, shared by --model and docs. */
export function renderApplicationModel(model: ApplicationModel): string {
  const depCount = model.dependencies.length
  const nativeCount = model.dependencies.filter(d => d.native).length
  const lines: string[] = []
  lines.push(`application`)
  lines.push(` ├── screens        (${model.screens.length})   ${model.screens.slice(0, 8).map(s => s.name).join(', ')}${model.screens.length > 8 ? ' …' : ''}`)
  lines.push(` ├── navigation     (${model.navigators.length})  ${model.navigators.slice(0, 6).join(', ')}${model.navigators.length > 6 ? ' …' : ''}`)
  lines.push(` ├── state          (${model.stateStores.length})  ${model.stateStores.slice(0, 6).map(s => s.name).join(', ')}${model.stateStores.length > 6 ? ' …' : ''}`)
  lines.push(` ├── native modules (${model.nativeModules.length})  ${model.nativeModules.slice(0, 6).join(', ')}${model.nativeModules.length > 6 ? ' …' : ''}`)
  lines.push(` ├── dependencies   (${depCount}, ${nativeCount} native)`)
  lines.push(` ├── source files   (${model.sourceFiles})`)
  lines.push(` └── architecture   (components ${model.components} · cycles ${model.cycles})`)
  return lines.join('\n')
}
