import { ArtifactStore } from './ArtifactStore'
import { KnowledgeIndex } from './KnowledgeIndex'
import { ROLE_ARTIFACT_TYPES } from './artifactTypes'
import type { IndexedArtifact } from './KnowledgeIndex'
import type { EmbeddingProvider } from './embeddings'
import type { Artifact, ArtifactRole, ArtifactType } from './artifactTypes'

export interface ProjectRegistration {
  name: string
  team?: string
  store: ArtifactStore
}

export interface TeamSearchQuery {
  query: string
  team?: string
  project?: string
  type?: ArtifactType
  limit?: number
}

export interface TeamSearchResult {
  artifact: Artifact
  project: string
  team?: string
  score: number
  lexicalScore: number
  semanticScore: number | null
}

export interface ProjectSummary {
  name: string
  team?: string
  artifactCount: number
}

export interface TeamContextOptions {
  team?: string
  project?: string
  role?: ArtifactRole
}

export interface TeamStoreOptions {
  embeddingProvider?: EmbeddingProvider
  semanticWeight?: number
}

interface ProjectEntry {
  registration: ProjectRegistration
  artifacts: Artifact[]
}

export class TeamStore {
  private entries: ProjectEntry[] = []
  private index: KnowledgeIndex
  private embeddingProvider: EmbeddingProvider | undefined
  private semanticWeight: number

  constructor(options: TeamStoreOptions = {}) {
    this.embeddingProvider = options.embeddingProvider
    this.semanticWeight = options.semanticWeight ?? 0.5
    this.index = this.buildIndex()
  }

  register(project: ProjectRegistration): void {
    const index = this.entries.findIndex(e => e.registration.name === project.name)
    const entry: ProjectEntry = { registration: project, artifacts: project.store.list() }
    if (index !== -1) {
      this.entries[index] = entry
    } else {
      this.entries.push(entry)
    }
    this.index = this.buildIndex()
  }

  projects(): ProjectSummary[] {
    return this.entries.map(e => ({
      name: e.registration.name,
      team: e.registration.team,
      artifactCount: e.artifacts.length,
    }))
  }

  search(query: TeamSearchQuery): TeamSearchResult[] {
    return this.index
      .search(query.query, {
        team: query.team,
        project: query.project,
        type: query.type,
        limit: query.limit,
      })
      .map(r => ({
        artifact: r.artifact,
        project: r.project || '',
        team: r.team,
        score: r.score,
        lexicalScore: r.lexicalScore,
        semanticScore: r.semanticScore,
      }))
  }

  context(options: TeamContextOptions = {}): string {
    const lines = ['# Team knowledge context']
    const roleTypes = options.role ? ROLE_ARTIFACT_TYPES[options.role] : null

    for (const entry of this.entries) {
      const { registration } = entry
      if (options.project && registration.name !== options.project) continue
      if (options.team && registration.team !== options.team) continue

      const artifacts = roleTypes
        ? entry.artifacts.filter(a => roleTypes.includes(a.type))
        : entry.artifacts

      if (artifacts.length === 0) continue

      lines.push('', `## ${registration.name}${registration.team ? ` (${registration.team})` : ''} — ${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}`)
      for (const artifact of artifacts) {
        const date = new Date(artifact.updatedAt).toISOString().slice(0, 10)
        lines.push(`- [${artifact.status}] ${artifact.title} (${artifact.type}) — updated ${date}`)
      }
    }

    return lines.join('\n')
  }

  private buildIndex(): KnowledgeIndex {
    const index = new KnowledgeIndex(this.embeddingProvider || null, this.semanticWeight)
    const docs: IndexedArtifact[] = []
    for (const entry of this.entries) {
      for (const artifact of entry.artifacts) {
        docs.push({
          artifact,
          project: entry.registration.name,
          team: entry.registration.team,
        })
      }
    }
    index.addAll(docs)
    return index
  }
}
