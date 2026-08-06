import { ARTIFACT_ROLES, ROLE_ARTIFACT_TYPES } from './artifactTypes'
import type { Artifact, ArtifactRole } from './artifactTypes'

export class RoleEngine {
  buildContext(role: ArtifactRole, artifacts: Artifact[]): string {
    if (!ARTIFACT_ROLES.includes(role)) {
      throw new Error(`Unknown role: ${role}. Valid roles: ${ARTIFACT_ROLES.join(', ')}`)
    }

    const lines = [`# Knowledge context for ${role}`]
    const types = ROLE_ARTIFACT_TYPES[role]

    for (const type of types) {
      const relevant = artifacts.filter(a => a.type === type)
      if (relevant.length === 0) continue

      lines.push('', `## ${type} (${relevant.length})`)
      for (const artifact of relevant) {
        const date = new Date(artifact.updatedAt).toISOString().slice(0, 10)
        lines.push(`- [${artifact.status}] ${artifact.title} — updated ${date}`)
      }
    }

    return lines.join('\n')
  }
}
