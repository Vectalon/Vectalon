export type RefreshSeverity = 'info' | 'warning' | 'error'

export interface WebFetcher {
  fetch(url: string): Promise<string>
}

export interface KnowledgeSource {
  id: string
  name: string
  description: string
  urls: string[]
  refreshIntervalMs: number
  type: 'docs' | 'changelog' | 'registry' | 'best-practices' | 'news'
  metadata?: Record<string, string>
}

export interface FetchedDocument {
  sourceId: string
  url: string
  fetchedAt: number
  content: string
  statusCode: number
  error?: string
}

export interface ImprovementSuggestion {
  id: string
  sourceId: string
  severity: RefreshSeverity
  library: string
  currentVersion?: string
  latestVersion?: string
  title: string
  description: string
  createdAt: number
}

export interface RefreshResult {
  fetchedAt: number
  documents: FetchedDocument[]
  suggestions: ImprovementSuggestion[]
  /** Web intel headlines collected from news/changelog sources. */
  intel: IntelItem[]
  errors: { sourceId: string; url: string; error: string }[]
}

export interface IntelItem {
  sourceId: string
  sourceName: string
  title: string
  url: string
  publishedAt?: string
  fetchedAt: number
}

export interface KnowledgeRefreshOptions {
  projectRoot: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  force?: boolean
  sources?: KnowledgeSource[]
  fetcher?: WebFetcher
}
