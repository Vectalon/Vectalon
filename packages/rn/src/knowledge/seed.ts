/**
 * vectalon knowledge — automatic knowledge-base seeding from the repo scan
 * Business Source License 1.1 (BSL-1.1)
 *
 * Knowledge is Vectalon's responsibility, never the customer's. `vectalon init`
 * scans the repo, builds the knowledge graph (snapshot.json, code-graph.json,
 * knowledge-graph.json, context.md), and seeds the artifact knowledge base with
 * repo-derived artifacts so agents have project context immediately — no manual
 * import step. The same idempotent seed runs on every periodic refresh (the
 * `serve` hourly scheduler and `vectalon refresh`), so the knowledge base
 * tracks code changes automatically.
 */

import { ContextEngine } from '../harness/ContextEngine'
import { ProjectMemory } from '../memory/ProjectMemory'
import { PatternLearner } from '../memory/PatternLearner'
import { ArtifactStore } from './ArtifactStore'
import { detectVersions } from '../upgrade/detect'
import { newArchitectureLabel } from '../utils/newArchitecture'
import type { ContextSnapshot } from '../harness/types'
import type { ArtifactType } from './artifactTypes'
import type { PatternStore } from '../memory/PatternLearner'

export interface KnowledgeSeedOptions {
  /** Reuse an already-scanned engine (init built one); a fresh scan runs otherwise. */
  engine?: ContextEngine
  /** Reuse the init pattern store so already-learned patterns persist in the seed. */
  patternStore?: PatternStore
}

export interface KnowledgeSeedResult {
  created: number
  updated: number
  total: number
}

/** Seed-owned artifact marker — the seed never touches artifacts it does not own. */
const SEED_MARKER = 'vectalon-seed'

/**
 * Scan the repo and seed the artifact knowledge base with repo-derived
 * artifacts. Idempotent: seed-owned artifacts (marked via `meta`) are upserted
 * in place, so re-runs only update content that actually changed. Callers wrap
 * this in try/catch (init/serve/refresh do) — knowledge maintenance must never
 * take down the host.
 */
export function seedKnowledgeBaseFromScan(root: string, options: KnowledgeSeedOptions = {}): KnowledgeSeedResult {
  const engine = options.engine || new ContextEngine(root)
  const snapshot = engine.getSnapshot() || engine.init()

  // Learn patterns from the freshly scanned components (idempotent — the
  // learner counts occurrences across runs via the shared memory store).
  let patternStore = options.patternStore
  if (!patternStore) {
    const memory = new ProjectMemory(root)
    new PatternLearner(memory).learnFromComponents(snapshot.components)
    patternStore = memory
  }

  let created = 0
  let updated = 0
  const store = new ArtifactStore(root)

  const upsert = (type: ArtifactType, title: string, content: string, meta: Record<string, string> = {}): void => {
    // Match only seed-owned artifacts: the store is shared with user-generated
    // workflow artifacts, so a colliding title must never hijack the user's.
    const existing = store.list().find(a => a.meta[SEED_MARKER] === '1' && a.type === type && a.title === title)
    if (existing) {
      if (existing.content !== content) {
        store.update(existing.id, { content })
        updated += 1
      }
    } else {
      store.add({ type, title, content, source: 'generated', status: 'active', meta: { [SEED_MARKER]: '1', ...meta } })
      created += 1
    }
  }

  upsert('engineering', 'Project Snapshot', renderProjectSnapshot(snapshot), { kind: 'project' })
  upsert('architecture', 'Knowledge Graph', renderKnowledgeGraph(snapshot), { kind: 'graph' })
  upsert('engineering', 'Code Graph', renderCodeGraph(snapshot), { kind: 'code-graph' })
  upsert('engineering', 'Native Configuration', renderNativeConfiguration(root), { kind: 'native' })
  upsert('engineering', 'Learned Patterns', renderLearnedPatterns(patternStore), { kind: 'patterns' })

  return { created, updated, total: store.list().length }
}

/**
 * Full maintenance pass: re-scan the repo, re-learn patterns, and re-seed the
 * knowledge base. Used by the `serve` hourly scheduler and `vectalon refresh`
 * so the knowledge base stays current without any customer action.
 */
export function maintainKnowledgeBase(root: string): KnowledgeSeedResult {
  const engine = new ContextEngine(root)
  engine.refresh()
  const memory = new ProjectMemory(root)
  const snapshot = engine.getSnapshot()
  if (snapshot) {
    new PatternLearner(memory).learnFromComponents(snapshot.components)
  }
  return seedKnowledgeBaseFromScan(root, { engine, patternStore: memory })
}

function renderProjectSnapshot(snapshot: ContextSnapshot): string {
  const { project } = snapshot
  const lines = [
    `# Project: ${project.name} v${project.version}`,
    '',
    `- React Native: ${project.reactNativeVersion}`,
    `- React: ${project.reactVersion || 'unknown'}`,
    `- Tooling: ${project.tooling === 'expo' ? `Expo (SDK ${project.expoSdkVersion || 'unknown'})` : 'React Native CLI (bare)'}`,
    `- Platforms: ${project.platforms.join(', ') || 'unknown'}`,
    `- TypeScript: ${project.hasTypeScript ? 'yes' : 'no'}`,
    `- Metro: ${project.hasMetro ? 'yes' : 'no'}`,
    `- New Architecture: ${newArchitectureLabel(project.newArchitecture)}`,
  ]
  if (project.workspace?.isMonorepo) {
    lines.push('', `- Monorepo: ${project.workspace.manager || 'unknown'} workspace`)
  }
  const deps = Object.entries(project.dependencies)
  if (deps.length > 0) {
    lines.push('', '## Dependencies')
    for (const [name, version] of deps.slice(0, 40)) lines.push(`- ${name}@${version}`)
  }
  const devDeps = Object.entries(project.devDependencies)
  if (devDeps.length > 0) {
    lines.push('', '## Dev dependencies')
    for (const [name, version] of devDeps.slice(0, 40)) lines.push(`- ${name}@${version}`)
  }
  return lines.join('\n')
}

function renderKnowledgeGraph(snapshot: ContextSnapshot): string {
  const kg = snapshot.knowledgeGraph
  if (!kg) return '# Knowledge Graph\n\nNo knowledge graph built for this project.'
  const lines = ['# Knowledge Graph', '']
  if (kg.navigators.length > 0 || kg.expoRoutes.length > 0) {
    lines.push('## Navigation')
    for (const route of kg.expoRoutes.filter(r => !r.isLayout).slice(0, 20)) {
      const dynamic = route.dynamicSegments.length > 0 ? ` [dynamic: ${route.dynamicSegments.join(', ')}]` : ''
      lines.push(`- Route ${route.route} (${route.filePath})${dynamic}`)
    }
    for (const nav of kg.navigators.slice(0, 20)) {
      const screens = nav.screens.map(s => `${s.name} → ${s.component}`).join(', ')
      lines.push(`- ${nav.name} (${nav.type}) in ${nav.filePath}: ${screens || 'no screens declared'}`)
    }
  }
  if (kg.stores.length > 0) {
    lines.push('', '## State management')
    for (const store of kg.stores.slice(0, 20)) {
      const consumers = store.consumers.map(c => c.component).join(', ')
      lines.push(`- ${store.name} (${store.kind}) in ${store.filePath}: used by ${consumers || 'none'}`)
    }
  }
  if (kg.nativeModules.length > 0) {
    lines.push('', '## Native modules')
    for (const mod of kg.nativeModules.slice(0, 20)) lines.push(`- ${mod.filePath}: ${mod.modules.join(', ')}`)
  }
  if (kg.reRenderImpact.length > 0) {
    lines.push('', '## Re-render impact')
    for (const impact of kg.reRenderImpact.slice(0, 10)) {
      const screens = impact.screens
        .map(id => {
          const component = kg.components.find(c => c.id === id)
          return component ? component.name : id
        })
        .join(', ')
      lines.push(`- ${impact.name} (${impact.filePath}) ← ${impact.parents.length} parents; affects ${screens || 'none'}`)
    }
  }
  return lines.join('\n')
}

function renderCodeGraph(snapshot: ContextSnapshot): string {
  const graph = snapshot.codeGraph
  if (!graph) return '# Code Graph\n\nNo code graph built for this project.'
  const lines = ['# Code Graph', '']
  lines.push(`- Files analyzed: ${graph.nodes.filter(n => n.type === 'file').length}`)
  lines.push(`- Import/export edges: ${graph.edges.length}`)
  if (graph.cycles.length > 0) {
    lines.push('', '## Import cycles')
    for (const cycle of graph.cycles.slice(0, 10)) lines.push(`- ${cycle.join(' → ')}`)
  }
  if (graph.orphans.length > 0) {
    lines.push('', `## Orphan files (${graph.orphans.length})`)
    for (const orphan of graph.orphans.slice(0, 20)) lines.push(`- ${orphan}`)
  }
  return lines.join('\n')
}

function renderNativeConfiguration(root: string): string {
  const versions = detectVersions(root)
  const lines = ['# Native Configuration', '', '## Android']
  lines.push(`- Hermes: ${boolLabel(versions.android.hermesEnabled)}`)
  lines.push(`- New Architecture: ${boolLabel(versions.android.newArchEnabled)}`)
  lines.push(`- Kotlin: ${versions.android.kotlinVersion || 'unknown'}`)
  lines.push(`- compileSdk: ${versions.android.compileSdkVersion || 'unknown'} · minSdk: ${versions.android.minSdkVersion || 'unknown'} · targetSdk: ${versions.android.targetSdkVersion || 'unknown'}`)
  lines.push('', '## iOS')
  lines.push(`- Podfile: ${versions.ios.podfilePath ? 'present' : 'absent'}`)
  lines.push(`- Hermes (Podfile): ${boolLabel(versions.ios.hermesEnabled)}`)
  lines.push(`- New Architecture flag: ${versions.ios.newArchFlag ? 'set' : 'unset'}`)
  return lines.join('\n')
}

function renderLearnedPatterns(patternStore: PatternStore): string {
  // Confidence/occurrences are runtime reinforcement stats that drift as the
  // memory store reinforces across runs — the durable project knowledge is the
  // pattern + description, so they (and only they) go into the artifact. This
  // keeps the seed deterministic and idempotent.
  const patterns = patternStore.getActivePatterns()
  if (patterns.length === 0) {
    return '# Learned Patterns\n\nNo patterns learned yet — they accumulate as the harness works on this project.'
  }
  const lines = ['# Learned Patterns', '']
  for (const pattern of patterns.slice(0, 30)) {
    lines.push(`- **${pattern.pattern}** — ${pattern.description}`)
  }
  return lines.join('\n')
}

function boolLabel(value: boolean | null): string {
  if (value === null) return 'unknown'
  return value ? 'enabled' : 'disabled'
}
