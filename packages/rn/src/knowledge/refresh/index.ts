export { KnowledgeRefreshService } from './KnowledgeRefreshService'
export { FetchWebFetcher, StubWebFetcher, createDefaultFetcher } from './fetchers'
export { defaultSources, registrySourcesForDependencies } from './sources'
export { extractIntelItems, collectIntel } from './intel'
export type {
  RefreshSeverity,
  WebFetcher,
  KnowledgeSource,
  FetchedDocument,
  ImprovementSuggestion,
  RefreshResult,
  KnowledgeRefreshOptions,
  IntelItem,
} from './types'
