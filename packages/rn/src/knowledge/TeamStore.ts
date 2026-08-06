import { ArtifactStore } from './ArtifactStore'
import { KnowledgeIndex } from './KnowledgeIndex'
import { ROLE_ARTIFACT_TYPES } from './artifactTypes'
import type { IndexedArtifact } from './KnowledgeIndex'
import { reportError } from '../utils/safe'
import type { EmbeddingProvider } from './embeddings'
import type { RemoteEmbeddingProvider } from './remoteEmbeddings'
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
  /** Real (async) embedding API; enables semantic search through searchRemote. */
  remoteEmbeddingProvider?: RemoteEmbeddingProvider
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
  private remoteEmbeddingProvider: RemoteEmbeddingProvider | null
  private semanticWeight: number

  constructor(options: TeamStoreOptions = {}) {
    this.embeddingProvider = options.embeddingProvider
    this.remoteEmbeddingProvider = options.remoteEmbeddingProvider || null
    this.semanticWeight = options.semanticWeight ?? 0.5
    this.index = this.buildIndex()
  }

  /**
   * Async search using the real embedding API; falls back to sync search when
   * no remote provider is configured or the API call fails (network, quota).
   */
  async searchRemote(query: TeamSearchQuery): Promise<TeamSearchResult[]> {
    if (!this.remoteEmbeddingProvider) {
      return this.search(query)
    }
    try {
      const results = await this.index.searchRemote(query.query, {
        team: query.team,
        project: query.project,
        type: query.type,
        limit: query.limit,
      })
      return results.map(r => ({
        artifact: r.artifact,
        project: r.project || '',
        team: r.team,
        score: r.score,
        lexicalScore: r.lexicalScore,
        semanticScore: r.semanticScore,
      }))
    } catch (err) {
      // A dead embedding endpoint must never break search; degrade to the
      // deterministic lexical/hash path.
      reportError(err, 'TeamStore: embedding search failed, degrading to lexical')
      return this.search(query)
    }
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
    const index = new KnowledgeIndex(this.embeddingProvider || null, this.semanticWeight, this.remoteEmbeddingProvider)
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
