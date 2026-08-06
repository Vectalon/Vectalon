import type { Artifact } from './artifactTypes'
import type { ArtifactStore } from './ArtifactStore'

export class Traceability {
  private store: ArtifactStore

  constructor(store: ArtifactStore) {
    this.store = store
  }

  getLinked(id: string): Artifact[] {
    const artifact = this.store.get(id)
    if (!artifact) return []

    const linked = new Map<string, Artifact>()
    for (const childId of artifact.links) {
      const child = this.store.get(childId)
      if (child) linked.set(child.id, child)
    }
    for (const other of this.store.list()) {
      if (other.id === id) continue
      if (other.links.includes(id)) linked.set(other.id, other)
    }
    return Array.from(linked.values())
  }

  traceForward(id: string): Artifact[] {
    return this.trace(id, (current) => current.links.map(c => this.store.get(c)).filter(Boolean) as Artifact[])
  }

  traceBackward(id: string): Artifact[] {
    return this.trace(id, (current) =>
      this.store.list().filter(other => other.links.includes(current.id))
    )
  }

  private trace(id: string, expand: (artifact: Artifact) => Artifact[]): Artifact[] {
    const start = this.store.get(id)
    if (!start) return []

    const visited = new Set<string>()
    const queue: Artifact[] = [start]
    const result: Artifact[] = []

    while (queue.length > 0) {
      const current = queue.shift() as Artifact
      for (const next of expand(current)) {
        if (visited.has(next.id)) continue
        visited.add(next.id)
        result.push(next)
        queue.push(next)
      }
    }

    return result
  }
}
