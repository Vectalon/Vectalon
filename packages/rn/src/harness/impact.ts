import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve, basename, extname } from 'path'
import { analyzeSourceFile } from './AstScanner'
import { detectWorkspace } from './workspace'
import type { WorkspaceInfo } from './workspace'
import { reportError } from '../utils/safe'

/**
 * Monorepo cross-package impact analysis — Phase V-4.
 *
 * When a shared package (e.g. `@acme/ui`) changes, compute the blast radius
 * across the workspace: which files in which packages consume it, which
 * screens re-render, which navigation stacks are involved, and which Maestro
 * E2E flows must run. The result renders as a PR comment automatically.
 *
 * The graph is built from the same AST analysis as the knowledge graph, so it
 * is deterministic and needs no model calls.
 */

export interface ImpactedFile {
  /** Path relative to the workspace root. */
  path: string
  /** Workspace package name that owns the file. */
  packageName: string
  kind: 'screen' | 'component' | 'route' | 'file'
  /** Human-readable reason, e.g. `imports @acme/ui` / `screen for Dashboard`. */
  detail: string
}

export interface E2EFlowHit {
  /** Path relative to the workspace root. */
  path: string
  packageName: string
  /** Screen / route name the flow references. */
  screen: string
}

export interface ReRenderScreen {
  screen: string
  packageName: string
  /** Component from the changed package that the screen renders. */
  component: string
}

export interface CrossPackageImpact {
  root: string
  isMonorepo: boolean
  manager: string | null
  /** Changed paths as given, normalized relative to root. */
  changedFiles: string[]
  /** Workspace package names containing the changed files. */
  changedPackages: string[]
  /** Package names (other than the changed ones) with affected files. */
  affectedPackages: string[]
  /** Every affected file across the workspace, with its reason. */
  affectedFiles: ImpactedFile[]
  /** Screen / route component names touched by the change. */
  affectedScreens: string[]
  /** Navigator definitions (file + navigator name) containing affected screens. */
  affectedNavigators: string[]
  /** Maestro flows that reference an affected screen. */
  e2eFlows: E2EFlowHit[]
  /** Screens that render a changed component (re-render blast radius). */
  reRenderScreens: ReRenderScreen[]
  summary: {
    packages: number
    files: number
    screens: number
    navigators: number
    e2eFlows: number
  }
}

interface ImportResolution {
  source: string
  names: string[]
  /** Absolute targets for relative sources; empty for package imports. */
  resolved: string[]
}

interface FileInfo {
  abs: string
  rel: string
  packageName: string
  imports: string[]
  importResolutions: ImportResolution[]
  components: { name: string; children: string[]; isDefaultExport: boolean }[]
  navigators: { name: string; type: string; screens: { name: string; component: string }[] }[]
  isRoute: boolean
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const SKIP_DIRS = new Set([
  'node_modules',
  '.vectalon',
  '.git',
  'ios',
  'android',
  'build',
  'dist',
  'coverage',
  '.expo',
  'vendor',
])

function isSourceFile(name: string): boolean {
  return SOURCE_EXTS.has(extname(name))
}

function walkSourceFiles(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err) {
    reportError(err, `impact: reading directory ${dir}`)
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let stat: ReturnType<typeof statSync> | null = null
    try {
      stat = statSync(full)
    } catch (err) {
      reportError(err, `impact: stat ${full}`)
      continue
    }
    if (!stat) continue
    if (stat.isDirectory()) {
      walkSourceFiles(full, out)
    } else if (isSourceFile(entry)) {
      out.push(full)
    }
  }
}

/** Package name for a directory, or null when there is no package.json. */
function packageNameAt(dir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { name?: string }
    return pkg.name || null
  } catch {
    return null
  }
}

/** True when the import source references the given internal package. */
function importsPackage(source: string, packageName: string): boolean {
  if (!packageName) return false
  if (source === packageName) return true
  return source.startsWith(packageName + '/')
}

/**
 * Compute the cross-package blast radius of a set of changed files.
 *
 * `changedFiles` may be absolute or relative to `root`. When the root is not
 * part of a workspace the analysis still runs over the single package, so the
 * report is meaningful for standalone projects too (affected screens, E2E
 * flows, and re-render screens all still apply).
 */
export function analyzeCrossPackageImpact(root: string, changedFiles: string[]): CrossPackageImpact {
  const ws: WorkspaceInfo = detectWorkspace(root)

  // Scan roots: every workspace package, or the root itself when standalone.
  const packageDirs = ws.isMonorepo && ws.packages.length > 0 ? ws.packages : [resolve(root)]
  const dirToPackage = new Map<string, string>()
  // Workspace gives us name → dir; invert it for dir → name.
  const nameToDir = new Map<string, string>()
  if (ws.isMonorepo) {
    for (const [name, dir] of Object.entries(ws.internalPackages)) {
      nameToDir.set(name, dir)
    }
  }
  for (const dir of packageDirs) {
    const name = [...nameToDir.entries()].find(([, d]) => d === dir)?.[0] || packageNameAt(dir) || basename(dir) || 'root'
    dirToPackage.set(dir, name)
    nameToDir.set(name, dir)
  }

  const files: FileInfo[] = []
  const fileByRel = new Map<string, FileInfo>()
  for (const dir of packageDirs) {
    const packageName = dirToPackage.get(dir) || 'root'
    const absFiles: string[] = []
    walkSourceFiles(dir, absFiles)
    for (const abs of absFiles) {
      const rel = relative(root, abs)
      const info = analyzeFile(abs, rel, packageName, root)
      if (!info) continue
      files.push(info)
      fileByRel.set(rel, info)
      // Also index by absolute path so changed-file resolution works either way.
      fileByRel.set(abs, info)
    }
  }

  // Normalize changed files to rel paths.
  const changedRel: string[] = []
  const changedPackages = new Set<string>()
  for (const cf of changedFiles) {
    if (!cf) continue
    const abs = resolve(root, cf)
    const rel = relative(root, abs)
    changedRel.push(rel)
    const owner = files.find(f => f.abs === abs) || files.find(f => f.rel === rel || rel.startsWith(f.rel + '/'))
    if (owner) changedPackages.add(owner.packageName)
  }

  // For each changed file, find the package it belongs to (nearest ancestor
  // package dir), then find consumers of that package.
  const affectedFiles = new Map<string, ImpactedFile>()
  const affectedScreens = new Set<string>()
  const affectedNavigators = new Set<string>()
  const changedPackageSet = new Set<string>(changedPackages)

  const changedPackageNames = [...changedPackageSet]
  for (const cf of changedRel) {
    const abs = resolve(root, cf)
    const changedInfo = fileByRel.get(cf) || fileByRel.get(abs)
    const changedPkg = changedInfo?.packageName || nearestPackage(abs, packageDirs, dirToPackage)

    // Consumers: cross-package files that import this package by name, plus
    // same-package files that directly import the changed file itself.
    for (const info of files) {
      if (info.abs === abs) continue // never flag the changed file itself

      let hits: string[]
      if (info.packageName === changedPkg) {
        // Same package: only direct relative imports of the changed file.
        const resolved = info.importResolutions.flatMap(r => r.resolved)
        if (!resolved.some(r => r === abs)) continue
        hits = ['relative']
      } else {
        // Cross-package: imports of the changed package name (e.g. @acme/ui).
        hits = info.imports.filter(src => importsPackage(src, changedPkg))
        if (hits.length === 0) continue
      }

      if (!affectedFiles.has(info.rel)) {
        affectedFiles.set(info.rel, {
          path: info.rel,
          packageName: info.packageName,
          kind: fileKind(info),
          detail: info.packageName === changedPkg ? `imports the changed file` : `imports ${changedPkg}${hits.length > 1 ? ` (${hits.length} imports)` : ''}`,
        })
      }

      // Screens: default-export components (screen files), navigator-declared
      // components, and route files in this consumer.
      for (const comp of info.components) {
        if (comp.isDefaultExport) affectedScreens.add(comp.name)
      }
      for (const nav of info.navigators) {
        for (const screen of nav.screens) {
          affectedScreens.add(screen.component)
        }
      }
      if (info.isRoute) {
        const routeName = routeNameFromPath(info.rel)
        if (routeName) affectedScreens.add(routeName)
      }
    }
  }

  // Navigator definitions that reference an affected screen (matched on the
  // screen's component binding, not the route name).
  for (const info of files) {
    for (const nav of info.navigators) {
      for (const screen of nav.screens) {
        if (affectedScreens.has(screen.component)) {
          affectedNavigators.add(`${info.rel} (${nav.name}:${nav.type})`)
        }
      }
    }
  }

  // Re-render blast radius: screens that import the changed package (or the
  // changed file directly) and render one of its bindings as a child.
  const changedAbs = new Set(changedRel.map(cf => resolve(root, cf)))
  const reRenderScreens: ReRenderScreen[] = []
  const screensSeen = new Set<string>()
  for (const info of files) {
    const changedBindings = new Set<string>()
    for (const b of info.importResolutions) {
      const isChanged =
        changedPackageNames.some(p => importsPackage(b.source, p)) ||
        b.resolved.some(r => changedAbs.has(r))
      if (isChanged) {
        for (const n of b.names) changedBindings.add(n)
      }
    }
    if (changedBindings.size === 0) continue
    for (const comp of info.components) {
      if (comp.children.some(c => changedBindings.has(c))) {
        const key = `${info.packageName}#${comp.name}`
        if (screensSeen.has(key)) continue
        screensSeen.add(key)
        const binding = [...changedBindings].find(b => comp.children.includes(b)) || 'component'
        reRenderScreens.push({
          screen: comp.name,
          packageName: info.packageName,
          component: binding,
        })
      }
    }
  }

  // Maestro E2E flows: yaml files under .maestro/ or e2e/ that reference an
  // affected screen. Match on the screen component name AND the route names of
  // navigators that reference an affected screen (flows assert on route names
  // like "Home") — never route names from unrelated navigators.
  const routeTokens = new Set<string>()
  for (const info of files) {
    for (const nav of info.navigators) {
      const referencesAffected = nav.screens.some(s => affectedScreens.has(s.component))
      if (referencesAffected) {
        for (const screen of nav.screens) routeTokens.add(screen.name)
      }
    }
  }
  const e2eTokens = new Set([...affectedScreens, ...routeTokens])
  const e2eFlows = findE2EFlows(packageDirs, root, e2eTokens)

  const affectedFilesList = [...affectedFiles.values()].sort((a, b) => a.path.localeCompare(b.path))
  const affectedPackages = [...new Set(affectedFilesList.map(f => f.packageName))].sort()
  const screensList = [...affectedScreens].sort()

  return {
    root,
    isMonorepo: ws.isMonorepo,
    manager: ws.manager,
    changedFiles: changedRel,
    changedPackages: changedPackageNames.sort(),
    affectedPackages,
    affectedFiles: affectedFilesList,
    affectedScreens: screensList,
    affectedNavigators: [...affectedNavigators].sort(),
    e2eFlows,
    reRenderScreens,
    summary: {
      packages: affectedPackages.length,
      files: affectedFilesList.length,
      screens: screensList.length,
      navigators: [...affectedNavigators].length,
      e2eFlows: e2eFlows.length,
    },
  }
}

function analyzeFile(abs: string, rel: string, packageName: string, root: string): FileInfo | null {
  let content: string
  try {
    content = readFileSync(abs, 'utf-8')
  } catch (err) {
    reportError(err, `impact: reading ${abs}`)
    return null
  }
  const analysis = analyzeSourceFile(content, rel)
  if (!analysis) return null

  const importResolutions: ImportResolution[] = analysis.imports.map(i => {
    const names = [...(i.defaultName ? [i.defaultName] : []), ...i.named]
    const resolved = i.source.startsWith('.') ? resolveRelativeImport(abs, [i.source], root) : []
    return { source: i.source, names, resolved }
  })

  return {
    abs,
    rel,
    packageName,
    imports: analysis.imports.map(i => i.source),
    importResolutions,
    components: analysis.components.map(c => ({
      name: c.name,
      children: c.children,
      isDefaultExport: c.isDefaultExport,
    })),
    navigators: analysis.navigation.navigators.map(n => ({
      name: n.name,
      type: n.type,
      screens: n.screens,
    })),
    // Expo Router app dirs can sit at the project root (app/) or inside a
    // workspace member (apps/mobile/app/) — match the /app/ segment anywhere.
    isRoute: /(^|\/)app\//.test(rel),
  }
}

function fileKind(info: FileInfo): ImpactedFile['kind'] {
  if (info.isRoute) return 'route'
  if (info.navigators.length > 0) return 'component'
  if (info.components.some(c => c.isDefaultExport)) return 'screen'
  return 'file'
}

function nearestPackage(abs: string, packageDirs: string[], dirToPackage: Map<string, string>): string {
  let best: string | null = null
  let bestLen = -1
  for (const dir of packageDirs) {
    // Path-boundary check: packages/ui must not claim packages/ui2/x.ts.
    if ((abs === dir || abs.startsWith(dir + '/')) && dir.length > bestLen) {
      bestLen = dir.length
      best = dir
    }
  }
  return best ? dirToPackage.get(best) || 'root' : 'root'
}

/** Resolve relative imports in a file to absolute targets (best-effort). */
function resolveRelativeImport(abs: string, imports: string[], root: string): string[] {
  const dir = abs.slice(0, abs.lastIndexOf('/'))
  const out: string[] = []
  for (const imp of imports) {
    if (!imp.startsWith('.')) continue
    const base = resolve(root, join(dir, imp))
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, 'index.ts'), join(base, 'index.tsx'), join(base, 'index.js'), join(base, 'index.jsx')]
    for (const c of candidates) {
      if (existsSync(c)) {
        out.push(c)
        break
      }
    }
  }
  return out
}

function routeNameFromPath(rel: string): string | null {
  // app/(tabs)/home.tsx → Home / home; app/user/[id].tsx → User; also works
  // for workspace members (apps/mobile/app/index.tsx → Home).
  const m = rel.match(/(^|\/)app\/(?:\([^)]+\)\/)*([^/]+)\.[jt]sx?$/)
  if (!m) return null
  const file = m[2]
  if (file === 'index') return 'Home'
  const name = file.replace(/^\[|\]$/g, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Scan .maestro/ and e2e/ dirs across packages for flows referencing screens. */
function findE2EFlows(packageDirs: string[], root: string, affectedScreens: Set<string>): E2EFlowHit[] {
  if (affectedScreens.size === 0) return []
  const hits: E2EFlowHit[] = []
  const seen = new Set<string>()

  for (const dir of packageDirs) {
    const packageName = packageNameAt(dir) || basename(dir)
    const candidates: string[] = []
    const maestroDir = join(dir, '.maestro')
    const e2eDir = join(dir, 'e2e')
    if (existsSync(maestroDir)) {
      const files: string[] = []
      walkYamlFiles(maestroDir, files)
      candidates.push(...files)
    }
    if (existsSync(e2eDir)) {
      const files: string[] = []
      walkYamlFiles(e2eDir, files)
      candidates.push(...files)
    }
    for (const abs of candidates) {
      const rel = relative(root, abs)
      if (seen.has(rel)) continue
      seen.add(rel)
      let content = ''
      try {
        content = readFileSync(abs, 'utf-8')
      } catch {
        continue
      }
      for (const screen of affectedScreens) {
        if (content.includes(screen)) {
          hits.push({ path: rel, packageName, screen })
          break
        }
      }
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path))
}

function walkYamlFiles(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const full = join(dir, entry)
    let stat: ReturnType<typeof statSync> | null = null
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (!stat) continue
    if (stat.isDirectory()) {
      walkYamlFiles(full, out)
    } else if (/\.(ya?ml)$/.test(entry)) {
      out.push(full)
    }
  }
}

/** Render the impact report as a markdown PR comment. */
export function renderImpactReport(impact: CrossPackageImpact): string {
  const lines: string[] = []
  lines.push(`## 🌐 Cross-package impact analysis`)
  lines.push('')
  if (impact.isMonorepo && impact.manager) {
    lines.push(`_Workspace: ${impact.manager} · ${impact.root}_`)
  }
  lines.push('')
  if (impact.changedFiles.length === 0) {
    lines.push('No changed files were provided — pass the changed paths (e.g. `packages/ui/src/Button.tsx`).')
    return lines.join('\n')
  }

  lines.push(`**Changed:** ${impact.changedFiles.map(f => '`' + f + '`').join(', ')}`)
  if (impact.changedPackages.length > 0) {
    lines.push(`**Changed packages:** ${impact.changedPackages.map(p => '`' + p + '`').join(', ')}`)
  }
  lines.push('')

  if (impact.summary.files === 0) {
    lines.push('✅ No cross-package consumers found — this change appears to be isolated.')
    return lines.join('\n')
  }

  lines.push(`**Blast radius:** ${impact.summary.packages} package(s) · ${impact.summary.files} file(s) · ${impact.summary.screens} screen(s) · ${impact.summary.navigators} navigator(s) · ${impact.summary.e2eFlows} E2E flow(s)`)
  lines.push('')

  lines.push('### Affected files')
  lines.push('')
  for (const f of impact.affectedFiles) {
    lines.push(`- \`${f.path}\` (_${f.packageName}_) — ${f.detail}`)
  }
  lines.push('')

  if (impact.affectedScreens.length > 0) {
    lines.push('### Screens & routes touched')
    lines.push('')
    lines.push(impact.affectedScreens.map(s => `- ${s}`).join('\n'))
    lines.push('')
  }

  if (impact.affectedNavigators.length > 0) {
    lines.push('### Navigation stacks')
    lines.push('')
    lines.push(impact.affectedNavigators.map(n => `- ${n}`).join('\n'))
    lines.push('')
  }

  if (impact.reRenderScreens.length > 0) {
    lines.push('### Re-render impact')
    lines.push('')
    lines.push('These screens render a component imported from the changed package:')
    lines.push('')
    for (const r of impact.reRenderScreens) {
      lines.push(`- \`${r.screen}\` (_${r.packageName}_) renders \`${r.component}\``)
    }
    lines.push('')
  }

  if (impact.e2eFlows.length > 0) {
    lines.push('### E2E flows to run')
    lines.push('')
    lines.push('These Maestro flows reference an affected screen — run them in CI:')
    lines.push('')
    for (const f of impact.e2eFlows) {
      lines.push(`- \`${f.path}\` (_${f.packageName}_) → ${f.screen}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('_Generated deterministically from AST analysis — no model calls._')
  return lines.join('\n')
}
