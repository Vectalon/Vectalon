import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import {
  checksum,
  ARTIFACT_TYPES,
} from './artifactTypes'
import type { Artifact, ArtifactSource, ArtifactStatus, ArtifactType } from './artifactTypes'

export interface AddArtifactInput {
  type: ArtifactType
  title: string
  content: string
  source?: ArtifactSource
  status?: ArtifactStatus
  meta?: Record<string, string>
}

export interface UpdateArtifactInput {
  title?: string
  content?: string
  status?: ArtifactStatus
}

const MAX_HISTORY = 10

export class ArtifactStore {
  private filePath: string
  private artifacts: Artifact[] = []

  constructor(root: string) {
    this.filePath = join(root, '.vectalon', 'knowledge', 'artifacts.json')
    this.artifacts = this.load()
  }

  list(): Artifact[] {
    return this.artifacts
  }

  get(id: string): Artifact | null {
    return this.artifacts.find(a => a.id === id) || null
  }

  add(input: AddArtifactInput): Artifact {
    const now = Date.now()
    const artifact: Artifact = {
      id: `art-${now}-${Math.random().toString(36).slice(2, 8)}`,
      type: input.type,
      title: input.title,
      content: input.content,
      source: input.source || 'import',
      status: input.status || 'draft',
      createdAt: now,
      updatedAt: now,
      version: 1,
      meta: input.meta || {},
      links: [],
      checksum: checksum(input.content),
      history: [],
    }
    this.artifacts.push(artifact)
    this.persist()
    return artifact
  }

  update(id: string, patch: UpdateArtifactInput): Artifact | null {
    const artifact = this.get(id)
    if (!artifact) return null

    if (patch.content !== undefined) {
      artifact.history.push({
        version: artifact.version,
        content: artifact.content,
        updatedAt: artifact.updatedAt,
        checksum: artifact.checksum,
      })
      artifact.history = artifact.history.slice(-MAX_HISTORY)
      artifact.content = patch.content
      artifact.checksum = checksum(patch.content)
      artifact.version++
    }

    if (patch.title !== undefined) artifact.title = patch.title
    if (patch.status !== undefined) artifact.status = patch.status

    artifact.updatedAt = Date.now()
    this.persist()
    return artifact
  }

  remove(id: string): boolean {
    const index = this.artifacts.findIndex(a => a.id === id)
    if (index === -1) return false
    this.artifacts.splice(index, 1)
    this.persist()
    return true
  }

  findByType(type: ArtifactType): Artifact[] {
    return this.artifacts.filter(a => a.type === type)
  }

  link(parentId: string, childId: string): boolean {
    const parent = this.get(parentId)
    if (!parent || !this.get(childId)) return false
    if (!parent.links.includes(childId)) {
      parent.links.push(childId)
      this.persist()
    }
    return true
  }

  hasChecksum(hash: string): boolean {
    return this.artifacts.some(a => a.checksum === hash)
  }

  private load(): Artifact[] {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf-8'))
      }
    } catch (err) {
      reportError(err, 'ArtifactStore: reading artifact store')
    }
    return []
  }

  private persist(): void {
    const dir = join(this.filePath, '..')
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.artifacts, null, 2))
  }

  static isValidType(type: string): type is ArtifactType {
    return (ARTIFACT_TYPES as string[]).includes(type)
  }
}
