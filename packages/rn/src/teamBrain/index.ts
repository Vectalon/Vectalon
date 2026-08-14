/**
 * vectalon team brain — Team Brain (Roadmap Phase 6, items 041-049)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic pass that generates the team-brain artifacts — project
 * glossary (044), coding standards (043), expertise map (046), ADR/decision
 * index (042, 048), PR knowledge (045), and onboarding brief (049) — seeds
 * them into the knowledge base, and writes docs to docs/vectalon/team/
 * (gitignored). `searchTeamBrain` implements the phase acceptance: team
 * knowledge searchable via semantic queries (across all registered projects).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
import { ArtifactStore } from '../knowledge/ArtifactStore'
import { TeamStore } from '../knowledge/TeamStore'
import { HashEmbeddingProvider } from '../knowledge/embeddings'
import { createRemoteEmbeddingProvider } from '../knowledge/remoteEmbeddings'
import { readProjectFile } from '../upgrade/scan'
import { detectVersions } from '../upgrade/detect'
import { buildGlossary, renderGlossary } from './glossary'
import { deriveStandards, renderStandards } from './standards'
import { deriveExpertise, renderExpertise } from './expertise'
import { indexDecisionFiles, renderDecisions } from './decisions'
import { derivePrKnowledge, renderPrKnowledge } from './prKnowledge'
import { renderOnboarding } from './onboarding'
import type { TeamBrainOptions, TeamBrainResult, TeamSearchHit } from './types'
import type { ArtifactType } from '../knowledge/artifactTypes'

export type { TeamBrainOptions, TeamBrainResult, TeamSearchHit } from './types'
export { buildGlossary } from './glossary'
export { deriveStandards } from './standards'
export { deriveExpertise } from './expertise'
export { indexDecisionFiles } from './decisions'
export { derivePrKnowledge } from './prKnowledge'

/** Where team-brain docs are written (mirrors other docs/vectalon/* dirs). */
export const teamDocsDir = (root: string): string => join(root, 'docs', 'vectalon', 'team')

/** Team-brain artifact marker — the pass never touches artifacts it does not own. */
const TEAM_MARKER = 'vectalon-team'

/** Read the project name from package.json, else the directory basename. */
export function projectNameOf(root: string): string {
  const raw = readProjectFile(root, 'package.json')
  if (raw) {
    try {
      const name = (JSON.parse(raw) as { name?: string }).name
      if (name) return name
    } catch {
      // fall through
    }
  }
  return basename(root)
}

/** Build the whole Team Brain in one deterministic pass. Runs the real git
 * log for the expertise map + PR knowledge when no output is injected (the
 * injectable seam keeps tests hermetic); git failures degrade to empty maps. */
export async function buildTeamBrain(root: string, options: TeamBrainOptions = {}): Promise<TeamBrainResult> {
  const scannedAt = Date.now()
  const resolvedRoot = resolve(root)
  const projectName = projectNameOf(resolvedRoot)

  const glossary = buildGlossary(resolvedRoot, options.glossaryLimit ?? 40)
  const standards = deriveStandards(resolvedRoot)
  const decisions = indexDecisionFiles(resolvedRoot, options.maxDecisions ?? 50)

  // Git-derived parts: injected output (hermetic tests) or the real git log;
  // failures never fail the pass — they degrade to empty maps.
  const expertise = await deriveExpertise(resolvedRoot, {
    gitLog: options.gitLog,
    gitFilesLog: options.gitFilesLog,
  })
  const prKnowledge = derivePrKnowledge(options.gitLog || '', options.maxPrs ?? 15)

  const versions = detectVersions(resolvedRoot)
  const tooling = versions.tooling === 'expo' ? 'Expo' : versions.tooling === 'rn-cli' ? 'React Native CLI' : undefined
  const onboarding = renderOnboarding({
    projectName,
    glossary,
    standards,
    expertise,
    decisions,
    prKnowledge,
    rnVersion: versions.rnVersion || undefined,
    tooling,
  })

  const store = new ArtifactStore(resolvedRoot)
  const seeded = seedTeamArtifacts(store, projectName, { glossary, standards, expertise, decisions, prKnowledge, onboarding })

  const result: TeamBrainResult = {
    scannedAt,
    root: resolvedRoot,
    projectName,
    glossary,
    standards,
    expertise,
    decisions,
    prKnowledge,
    onboarding,
    artifacts: seeded,
  }

  writeTeamDocs(resolvedRoot, result)
  return result
}

interface SeedParts {
  glossary: TeamBrainResult['glossary']
  standards: TeamBrainResult['standards']
  expertise: TeamBrainResult['expertise']
  decisions: TeamBrainResult['decisions']
  prKnowledge: TeamBrainResult['prKnowledge']
  onboarding: string
}

/** Idempotent upserts of team-owned artifacts into the knowledge base. */
function seedTeamArtifacts(store: ArtifactStore, projectName: string, parts: SeedParts): TeamBrainResult['artifacts'] {
  let created = 0
  let updated = 0

  const upsert = (type: ArtifactType, title: string, content: string, extraMeta: Record<string, string> = {}): void => {
    const existing = store.list().find(a => a.meta[TEAM_MARKER] === '1' && a.type === type && a.title === title)
    if (existing) {
      if (existing.content !== content) {
        store.update(existing.id, { content })
        updated += 1
      }
    } else {
      store.add({ type, title, content, source: 'generated', status: 'active', meta: { [TEAM_MARKER]: '1', ...extraMeta } })
      created += 1
    }
  }

  upsert('engineering', 'Project Glossary', renderGlossary(parts.glossary, projectName), { kind: 'glossary' })
  upsert('engineering', 'Coding Standards', renderStandards(parts.standards, projectName), { kind: 'standards' })
  upsert('operations', 'Team Expertise Map', renderExpertise(parts.expertise, projectName), { kind: 'expertise' })
  upsert('operations', 'Onboarding Brief', parts.onboarding, { kind: 'onboarding' })

  for (const decision of parts.decisions) {
    upsert(
      'architecture',
      decision.title,
      `# ${decision.title}\n\n- ID: \`${decision.id}\`\n- Status: ${decision.status || 'unknown'}\n- Source file: \`${decision.path}\`\n\n_Indexed by \`vectalon team\` from the decision record — edit the source file to update._`,
      { kind: 'decision', adrId: decision.id, path: decision.path }
    )
  }

  if (parts.prKnowledge.length > 0) {
    upsert(
      'engineering',
      'PR Knowledge',
      renderPrKnowledge(parts.prKnowledge, projectName),
      { kind: 'pr-knowledge' }
    )
  }

  return { created, updated, total: store.list().length }
}

/** Write the docs + report.json into docs/vectalon/team/ (gitignored). */
export function writeTeamDocs(root: string, result: TeamBrainResult): { mdPaths: string[]; jsonPath: string } {
  const dir = teamDocsDir(root)
  mkdirSync(dir, { recursive: true })
  const docs: Array<[string, string]> = [
    ['glossary.md', renderGlossary(result.glossary, result.projectName)],
    ['coding-standards.md', renderStandards(result.standards, result.projectName)],
    ['expertise.md', renderExpertise(result.expertise, result.projectName)],
    ['decisions.md', renderDecisions(result.decisions, result.projectName)],
    ['pr-knowledge.md', renderPrKnowledge(result.prKnowledge, result.projectName)],
    ['onboarding.md', result.onboarding],
  ]
  const mdPaths: string[] = []
  for (const [file, content] of docs) {
    const path = join(dir, file)
    writeFileSync(path, content)
    mdPaths.push(path)
  }
  const jsonPath = join(dir, 'report.json')
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n')
  return { mdPaths, jsonPath }
}

interface TeamConfig {
  team?: string
  projects?: Array<{ name: string; path: string; team?: string }>
}

/** Read the registered team config (.vectalon/team.json), if any. */
export function readTeamConfig(root: string): TeamConfig | null {
  const path = join(root, '.vectalon', 'team.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as TeamConfig
  } catch {
    return null
  }
}

export interface TeamProject {
  name: string
  team?: string
  path: string
  artifactCount: number
}

/** List registered team projects (the local project + .vectalon/team.json). */
export function listTeamProjects(root: string): TeamProject[] {
  const resolvedRoot = resolve(root)
  const local = new ArtifactStore(resolvedRoot)
  const projects: TeamProject[] = [
    { name: projectNameOf(resolvedRoot), team: undefined, path: resolvedRoot, artifactCount: local.list().length },
  ]
  const config = readTeamConfig(resolvedRoot)
  for (const project of config?.projects || []) {
    const projectRoot = resolve(resolvedRoot, project.path)
    const store = new ArtifactStore(projectRoot)
    projects.push({
      name: project.name,
      team: project.team || config?.team,
      path: project.path,
      artifactCount: store.list().length,
    })
  }
  return projects
}

export interface TeamSearchOptions {
  project?: string
  team?: string
  type?: ArtifactType
  limit?: number
}

/**
 * Search the team knowledge base across every registered project — the Phase 6
 * acceptance ("team knowledge searchable via semantic queries"). Uses the real
 * embedding API when configured; otherwise the deterministic hash seam. Never
 * throws and never hangs: a dead or slow embedding endpoint times out after
 * `embeddingTimeoutMs` and degrades to the deterministic lexical search.
 */
export async function searchTeamBrain(root: string, query: string, options: TeamSearchOptions & { embeddingTimeoutMs?: number } = {}): Promise<TeamSearchHit[]> {
  const resolvedRoot = resolve(root)
  const remoteProvider = createRemoteEmbeddingProvider()
  const teamStore = new TeamStore({
    embeddingProvider: new HashEmbeddingProvider(),
    ...(remoteProvider ? { remoteEmbeddingProvider: remoteProvider } : {}),
  })
  // Team metadata mirrors serve's buildTeamStore: the local project inherits
  // the config team, and each registered project overrides with its own. This
  // keeps `--team` scoping meaningful across every search surface.
  const config = readTeamConfig(resolvedRoot)
  const local = new ArtifactStore(resolvedRoot)
  teamStore.register({ name: projectNameOf(resolvedRoot), team: config?.team, store: local })
  for (const project of config?.projects || []) {
    const projectRoot = resolve(resolvedRoot, project.path)
    const projectStore = new ArtifactStore(projectRoot)
    if (projectStore.list().length === 0) continue
    teamStore.register({ name: project.name, team: project.team || config?.team, store: projectStore })
  }

  const searchParams = { query, project: options.project, team: options.team, type: options.type, limit: options.limit ?? 5 }
  const timeoutMs = options.embeddingTimeoutMs ?? 10_000
  let results
  try {
    results = await Promise.race([
      teamStore.searchRemote(searchParams),
      // unref() so a pending timeout never keeps the process (or a test run)
      // alive after the search resolves.
      new Promise<null>(resolveTimeout => {
        const timer = setTimeout(() => resolveTimeout(null), timeoutMs)
        timer.unref?.()
      }),
    ])
  } catch {
    results = null
  }
  // Timeout or error → the deterministic sync path (lexical + hash semantic).
  if (results === null) {
    results = teamStore.search(searchParams)
  }
  return results.map(r => ({
    title: r.artifact.title,
    type: r.artifact.type,
    project: r.project,
    team: r.team,
    score: r.score,
    confidence: r.confidence,
    snippet: snippetOf(r.artifact.content),
  }))
}

/** First ~200 chars of artifact content, markdown-stripped. */
function snippetOf(content: string): string {
  const plain = content
    .replace(/[#*`_>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 200 ? plain.slice(0, 200) + '…' : plain
}

/** Compact CLI summary of a Team Brain run. */
export function renderTeamSummary(result: TeamBrainResult): string {
  const lines: string[] = []
  lines.push(`# Team Brain — ${result.projectName}`)
  lines.push('')
  lines.push(`- Glossary: ${result.glossary.length} term(s)`)
  lines.push(`- Coding standards: ${result.standards.length} derived standard(s)`)
  lines.push(`- Expertise: ${result.expertise.length} author(s) mapped`)
  lines.push(`- Decisions indexed: ${result.decisions.length} ADR/decision file(s)`)
  lines.push(`- PR knowledge: ${result.prKnowledge.length} PR(s)`)
  lines.push(`- Knowledge base: ${result.artifacts.total} artifact(s) (${result.artifacts.created} created, ${result.artifacts.updated} updated)`)
  lines.push(`- Docs: ${teamDocsDir(result.root)}`)
  return lines.join('\n')
}
