/**
 * Native Module Registry (Roadmap 009) — every native integration in the
 * project: JS-side references (NativeModules / TurboModuleRegistry /
 * NativeEventEmitter), Podfile pods, local podspecs, and Gradle includes /
 * dependencies. Exported as JSON by `vectalon intel --graph native` so native
 * dependencies are searchable. Deterministic, no model calls.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { buildKnowledgeGraph } from '../harness'
import { reportError } from '../utils/safe'

export interface NativeModuleEntry {
  /** Module name as referenced from JS (e.g. `NativeSettings` or `Settings`). */
  name: string
  /** JS files that reference it (relative paths). */
  jsRefs: string[]
  /** True when a Podfile pod matches the module (autolinking or explicit). */
  pod: boolean
  /** Local podspec path, when the module ships one in the repo. */
  podspec: string | null
  /** True when android/settings.gradle includes the module. */
  gradleInclude: boolean
  /** True when a Gradle dependency references the module artifact. */
  gradleDependency: boolean
  /** True when a TurboModule TS spec exists (src/specs/Native<Name>.ts). */
  turboModuleSpec: boolean
  /** Overall signal: referenced from JS or declared natively. */
  referenced: boolean
}

export interface NativeModuleRegistry {
  entries: NativeModuleEntry[]
  /** Podfile pods declared, whether or not a JS reference exists. */
  podfilePods: string[]
  /** Local *.podspec files found in the repo. */
  podspecs: string[]
  /** Gradle `include ':x'` projects in android/settings.gradle. */
  gradleIncludes: string[]
  /** Counts by signal for the summary. */
  totals: { js: number; pods: number; podspecs: number; turboSpecs: number }
}

const POD_RE = /pod\s+['"]([A-Za-z0-9_.-]+)['"]/g
const SPEC_EXT = '.podspec'
const INCLUDE_RE = /include\s+['"](?::)?([A-Za-z0-9_.-]+)['"]/g
const GRADLE_DEP_RE = /(?:implementation|api|compile)\s+['"]([^'"]+)['"]/g

function walkFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'Pods' || entry === 'DerivedData') continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) walkFiles(fullPath, out)
    else out.push(fullPath)
  }
}

/**
 * Build the native module registry. JS references come from the shared
 * knowledge graph (pass one in for monorepo-wide scans); the native side is
 * scanned from ios/ (Podfile + podspecs) and android/ (settings.gradle +
 * build.gradle dependencies) plus any extra member dirs.
 */
export function buildNativeRegistry(
  root: string,
  graph: ReturnType<typeof buildKnowledgeGraph> = buildKnowledgeGraph(root),
  extraDirs: string[] = [],
  turboSpecDirs: string[] = [join(root, 'src', 'specs')]
): NativeModuleRegistry {
  const registry: NativeModuleRegistry = {
    entries: [],
    podfilePods: [],
    podspecs: [],
    gradleIncludes: [],
    totals: { js: 0, pods: 0, podspecs: 0, turboSpecs: 0 },
  }

  const jsRefs = new Map<string, string[]>()
  for (const mod of graph.nativeModules) {
    registry.totals.js += mod.modules.length
    for (const name of mod.modules) {
      const list = jsRefs.get(name) || []
      list.push(mod.filePath)
      jsRefs.set(name, list)
    }
  }

  const files: string[] = []
  const scanDirs = ['ios', 'android', 'src', ...extraDirs]
  for (const dir of scanDirs) {
    const abs = join(root, dir)
    if (existsSync(abs)) walkFiles(abs, files)
  }

  const pods = new Set<string>()
  let podfile: string | null = null
  const podspecs: string[] = []
  const gradleIncludes = new Set<string>()
  const gradleDeps = new Set<string>()

  for (const fullPath of files) {
    const rel = relative(root, fullPath)
    let content = ''
    try {
      content = readFileSync(fullPath, 'utf-8')
    } catch (err) {
      reportError(err, `intel:native: reading ${rel}`)
      continue
    }
    if (rel.endsWith('Podfile')) {
      podfile = rel
      for (const m of content.matchAll(POD_RE)) pods.add(m[1])
    } else if (rel.endsWith(SPEC_EXT)) {
      podspecs.push(rel)
    } else if (rel.endsWith('settings.gradle') || rel.endsWith('settings.gradle.kts')) {
      for (const m of content.matchAll(INCLUDE_RE)) gradleIncludes.add(m[1])
    } else if (rel.endsWith('.gradle') || rel.endsWith('.gradle.kts')) {
      for (const m of content.matchAll(GRADLE_DEP_RE)) gradleDeps.add(m[1])
    }
  }

  registry.podfilePods = [...pods].sort()
  registry.podspecs = podspecs.sort()
  registry.gradleIncludes = [...gradleIncludes].sort()
  registry.totals.pods = pods.size
  registry.totals.podspecs = podspecs.length

  // Local podspecs declare a module: podspec basename → module name.
  const specNames = new Set(podspecs.map(s => basenameWithoutExt(s)))

  // Match native declarations to JS refs by name fragments.
  const allNames = new Set<string>([...jsRefs.keys()])
  for (const name of registry.podfilePods) allNames.add(name)
  for (const name of specNames) allNames.add(name)
  for (const name of [...gradleIncludes, ...gradleDeps]) allNames.add(name)

  const turboSpecs = new Set<string>()
  for (const turboSpecDir of turboSpecDirs) {
    if (!existsSync(turboSpecDir)) continue
    const specFiles: string[] = []
    walkFiles(turboSpecDir, specFiles)
    for (const f of specFiles) {
      if (/\/Native[A-Za-z0-9]+\.tsx?$/.test(f)) turboSpecs.add(basenameWithoutExt(f).replace(/^Native/, ''))
    }
  }

  const turboSpecOf = (name: string): boolean => {
    const bare = name.replace(/^Native/, '')
    return turboSpecs.has(name.replace(/^Native/, '')) || turboSpecs.has(bare)
  }

  registry.totals.turboSpecs = turboSpecs.size

  for (const name of [...allNames].sort()) {
    const refs = jsRefs.get(name) || []
    const pod = registry.podfilePods.some(p => p === name || p === name.replace(/^Native/, ''))
    const podspec = podspecs.find(s => basenameWithoutExt(s) === name || basenameWithoutExt(s) === name.replace(/^Native/, '')) ?? null
    const gradleInclude = [...gradleIncludes, ...gradleDeps].some(g => g === name || g === name.replace(/^Native/, ''))
    const turboModuleSpec = turboSpecOf(name)
    registry.entries.push({
      name,
      jsRefs: refs,
      pod,
      podspec,
      gradleInclude,
      gradleDependency: [...gradleDeps].includes(name) || [...gradleDeps].includes(name.replace(/^Native/, '')),
      turboModuleSpec,
      referenced: refs.length > 0 || pod || podspec !== null || gradleInclude,
    })
  }
  void podfile
  return registry
}

function basenameWithoutExt(p: string): string {
  const base = p.split('/').pop() || ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}
