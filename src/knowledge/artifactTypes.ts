export type ArtifactType =
  | 'business'
  | 'research'
  | 'product'
  | 'requirements'
  | 'design'
  | 'architecture'
  | 'engineering'
  | 'data'
  | 'security'
  | 'qa'
  | 'devops'
  | 'operations'
  | 'analytics'
  | 'telemetry'

export type ArtifactSource = 'import' | 'generated' | 'user'

export type ArtifactStatus = 'draft' | 'active' | 'deprecated'

export type ArtifactRole = 'pm' | 'ba' | 'architect' | 'engineer' | 'qa' | 'devops' | 'support' | 'analyst'

export interface ArtifactVersion {
  version: number
  content: string
  updatedAt: number
  checksum: string
}

export interface Artifact {
  id: string
  type: ArtifactType
  title: string
  content: string
  source: ArtifactSource
  status: ArtifactStatus
  createdAt: number
  updatedAt: number
  version: number
  meta: Record<string, string>
  links: string[]
  checksum: string
  history: ArtifactVersion[]
}

export const ARTIFACT_TYPES: ArtifactType[] = [
  'business',
  'research',
  'product',
  'requirements',
  'design',
  'architecture',
  'engineering',
  'data',
  'security',
  'qa',
  'devops',
  'operations',
  'analytics',
  'telemetry',
]

export const ARTIFACT_ROLES: ArtifactRole[] = ['pm', 'ba', 'architect', 'engineer', 'qa', 'devops', 'support', 'analyst']

export const ROLE_ARTIFACT_TYPES: Record<ArtifactRole, ArtifactType[]> = {
  pm: ['business', 'research', 'product', 'analytics'],
  ba: ['research', 'product', 'requirements', 'analytics'],
  architect: ['requirements', 'architecture', 'security', 'engineering', 'data'],
  engineer: ['requirements', 'architecture', 'engineering', 'data', 'security', 'qa', 'telemetry'],
  qa: ['requirements', 'design', 'engineering', 'qa', 'devops'],
  devops: ['engineering', 'security', 'devops', 'operations', 'analytics', 'telemetry'],
  support: ['operations', 'product', 'qa', 'telemetry'],
  analyst: ['analytics', 'product', 'research', 'operations', 'telemetry'],
}

export function checksum(content: string): string {
  let hash = 5381
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i)
    hash |= 0
  }
  return (hash >>> 0).toString(16)
}
