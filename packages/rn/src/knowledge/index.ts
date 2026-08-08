/**
 * Vectalon RN — Knowledge base and company brain
 * Business Source License 1.1 (BSL-1.1)
 */

export { ArtifactStore } from './ArtifactStore'
export { SqliteArtifactStore, artifactDbPath, openDatabase, isSqliteAvailable } from './SqliteArtifactStore'
export { JsonArtifactStore } from './JsonArtifactStore'
export { TeamStore } from './TeamStore'
export { KnowledgeIndex } from './KnowledgeIndex'
export {
  SOURCE_CONFIDENCE,
  STATUS_CONFIDENCE,
  stalenessDate,
  recencyFactor,
  computeConfidence,
  artifactProvenance,
  confidenceFactor,
  rankByConfidence,
  patternProvenance,
} from './provenance'
export type { Provenance, ProvenanceOptions, PatternSource } from './provenance'
export { Traceability } from './Traceability'
export { RoleEngine } from './RoleEngine'
export { ARTIFACT_TYPES, ARTIFACT_ROLES, ROLE_ARTIFACT_TYPES, checksum } from './artifactTypes'
export { cosineSimilarity, HashEmbeddingProvider } from './embeddings'
export type { EmbeddingProvider } from './embeddings'
export {
  OpenAIEmbeddingProvider,
  OpenAICompatibleEmbeddingProvider,
  AzureOpenAIEmbeddingProvider,
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
export {
  TelemetryIngestionService,
  DEFAULT_TELEMETRY_DIRS,
  renderEventMarkdown,
  parseTelemetryContent,
  parseSentryExport,
  parseCrashlyticsReport,
  parsePerformanceTrace,
  parseAnalyticsEvent,
  detectTelemetryFormat,
} from './telemetry'
export type {
  TelemetryKind,
  TelemetryFrame,
  ParsedCrash,
  ParsedTrace,
  ParsedAnalyticsEvent,
  TelemetryEvent,
  TelemetryFormat,
  TelemetryIngestResult,
} from './telemetry'
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
export type {
  AddArtifactInput,
  UpdateArtifactInput,
  ArtifactStoreOptions,
  ArtifactStoreEngine,
} from './ArtifactStore'
export type {
  SqliteDb,
  SqliteStmt,
  StoreSearchOptions,
  VectorSearchHit,
  SqliteArtifactStoreOptions,
} from './SqliteArtifactStore'
