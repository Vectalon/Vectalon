export { ArtifactStore } from './ArtifactStore'
export { TeamStore } from './TeamStore'
export { KnowledgeIndex } from './KnowledgeIndex'
export { Traceability } from './Traceability'
export { RoleEngine } from './RoleEngine'
export { ARTIFACT_TYPES, ARTIFACT_ROLES, ROLE_ARTIFACT_TYPES, checksum } from './artifactTypes'
export { cosineSimilarity, HashEmbeddingProvider } from './embeddings'
export type { EmbeddingProvider } from './embeddings'
export {
  OpenAIEmbeddingProvider,
  OpenAICompatibleEmbeddingProvider,
  createRemoteEmbeddingProvider,
} from './remoteEmbeddings'
export type { RemoteEmbeddingProvider, OpenAIEmbeddingOptions } from './remoteEmbeddings'
export {
  ArtifactSync,
  readSyncConfig,
  writeSyncConfig,
  createArtifactSync,
  DEFAULT_SYNC_BRANCH,
} from './artifactSync'
export type {
  ArtifactSyncConfig,
  SyncResult,
  SyncOptions,
  GitExecutor,
} from './artifactSync'
export type {
  Artifact,
  ArtifactVersion,
  ArtifactType,
  ArtifactSource,
  ArtifactStatus,
  ArtifactRole,
} from './artifactTypes'
export type {
  ProjectRegistration,
  TeamSearchQuery,
  TeamSearchResult,
  ProjectSummary,
  TeamContextOptions,
  TeamStoreOptions,
} from './TeamStore'
export type {
  IndexedArtifact,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
} from './KnowledgeIndex'
