import { ArtifactStore } from './ArtifactStore'
import { ROLE_ARTIFACT_TYPES } from './artifactTypes'
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

interface ProjectEntry {
  registration: ProjectRegistration
  artifacts: Artifact[]
}

const DEFAULT_LIMIT = 5

export class TeamStore {
  private entries: ProjectEntry[] = []

  register(project: ProjectRegistration): void {
    const index = this.entries.findIndex(e => e.registration.name === project.name)
    const entry: ProjectEntry = { registration: project, artifacts: project.store.list() }
    if (index !== -1) {
      this.entries[index] = entry
    } else {
      this.entries.push(entry)
    }
  }

  projects(): ProjectSummary[] {
    return this.entries.map(e => ({
      name: e.registration.name,
      team: e.registration.team,
      artifactCount: e.artifacts.length,
    }))
  }

  search(query: TeamSearchQuery): TeamSearchResult[] {
    const terms = tokenize(query.query)
    if (terms.length === 0) return []

    const limit = typeof query.limit === 'number' && query.limit >= 0 ? query.limit : DEFAULT_LIMIT
    const matches: TeamSearchResult[] = []

    for (const entry of this.entries) {
      const { registration } = entry
      if (query.project && registration.name !== query.project) continue
      if (query.team && registration.team !== query.team) continue

      for (const artifact of entry.artifacts) {
        if (query.type && artifact.type !== query.type) continue
        const score = scoreArtifact(artifact, terms)
        if (score > 0) {
          matches.push({ artifact, project: registration.name, team: registration.team, score })
        }
      }
    }

    return matches
      .sort((a, b) => b.score - a.score || b.artifact.updatedAt - a.artifact.updatedAt)
      .slice(0, limit)
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
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1)
}

function scoreArtifact(artifact: Artifact, terms: string[]): number {
  const title = artifact.title.toLowerCase()
  const content = artifact.content.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 2
    else if (content.includes(term)) score += 1
  }
  return score
}
