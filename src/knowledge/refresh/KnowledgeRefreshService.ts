import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type {
  KnowledgeRefreshOptions,
  RefreshResult,
  FetchedDocument,
  ImprovementSuggestion,
  KnowledgeSource,
  WebFetcher,
} from './types'
import { defaultSources, registrySourcesForDependencies } from './sources'
import { createDefaultFetcher } from './fetchers'

const REFRESH_DIR = 'refresh'
const CACHE_FILE = 'cache.json'
const SUGGESTIONS_FILE = 'suggestions.json'
const SEVERE_BEHIND = 2
const WARNING_BEHIND = 1

interface RefreshCache {
  version: number
  lastRefreshAt: number
  documents: FetchedDocument[]
}

interface SuggestionStore {
  version: number
  suggestions: ImprovementSuggestion[]
  lastRefreshAt: number
}

export class KnowledgeRefreshService {
  private projectRoot: string
  private refreshDir: string
  private cachePath: string
  private suggestionsPath: string
  private fetcher: WebFetcher
  private sources: KnowledgeSource[]

  constructor(options: Pick<KnowledgeRefreshOptions, 'projectRoot' | 'fetcher' | 'sources'>) {
    this.projectRoot = options.projectRoot
    this.refreshDir = join(this.projectRoot, '.vectalon', 'knowledge', REFRESH_DIR)
    this.cachePath = join(this.refreshDir, CACHE_FILE)
    this.suggestionsPath = join(this.refreshDir, SUGGESTIONS_FILE)
    this.fetcher = options.fetcher || createDefaultFetcher()
    this.sources = options.sources || defaultSources
    this.ensureDir()
  }

  private activeRefresh: Promise<RefreshResult> | null = null

  async refresh(options: KnowledgeRefreshOptions): Promise<RefreshResult> {
    // Serialize refreshes so concurrent callers (feature workflow + background
    // scheduler) never interleave non-atomic cache writes.
    if (this.activeRefresh) {
      return this.activeRefresh
    }
    const run = this.doRefresh(options).finally(() => {
      this.activeRefresh = null
    })
    this.activeRefresh = run
    return run
  }

  private async doRefresh(options: KnowledgeRefreshOptions): Promise<RefreshResult> {
    const now = Date.now()
    const deps = { ...options.dependencies, ...options.devDependencies }
    const depNames = Object.keys(deps)
    const registrySources = registrySourcesForDependencies(depNames)
    const sourceLibraryMap = new Map<string, string>()
    for (const source of registrySources) {
      if (source.metadata?.libraryName) {
        sourceLibraryMap.set(source.id, source.metadata.libraryName)
      }
    }

    // Dedupe by URL, preferring dependency-derived registry sources so the
    // hardcoded default registry entries do not fetch the same endpoints twice.
    const sourcesByUrl = new Map<string, KnowledgeSource>()
    for (const source of [...registrySources, ...this.sources]) {
      for (const url of source.urls) {
        if (!sourcesByUrl.has(url)) {
          sourcesByUrl.set(url, source)
        }
      }
    }
    const sources = [...new Set(sourcesByUrl.values())]

    const cache = this.loadCache()
    const documents: FetchedDocument[] = []
    const errors: RefreshResult['errors'] = []
    const seenDocumentKeys = new Set<string>()

    const pushDocument = (doc: FetchedDocument): void => {
      const key = `${doc.sourceId}|${doc.url}`
      if (!seenDocumentKeys.has(key)) {
        seenDocumentKeys.add(key)
        documents.push(doc)
      }
    }

    for (const source of sources) {
      const cachedDoc = cache.documents.find(d => d.sourceId === source.id)
      const isStale = options.force || !cachedDoc || now - cachedDoc.fetchedAt > source.refreshIntervalMs

      if (!isStale) {
        pushDocument(cachedDoc)
        continue
      }

      for (const url of source.urls) {
        try {
          const content = await this.fetcher.fetch(url)
          pushDocument({ sourceId: source.id, url, fetchedAt: now, content, statusCode: 200 })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push({ sourceId: source.id, url, error: message })
          if (cachedDoc) {
            pushDocument(cachedDoc)
          }
        }
      }
    }

    const suggestions = this.generateSuggestions(documents, deps, sourceLibraryMap)
    this.saveCache({ version: 1, lastRefreshAt: now, documents })
    this.saveSuggestions({ version: 1, suggestions, lastRefreshAt: now })

    return {
      fetchedAt: now,
      documents,
      suggestions,
      errors,
    }
  }

  getSuggestions(): ImprovementSuggestion[] {
    return this.loadSuggestions().suggestions
  }

  getLastRefreshAt(): number {
    return this.loadCache().lastRefreshAt
  }

  isStale(): boolean {
    const cache = this.loadCache()
    if (cache.lastRefreshAt === 0) return true
    const minInterval = Math.min(...this.sources.map(s => s.refreshIntervalMs))
    return Date.now() - cache.lastRefreshAt > minInterval
  }

  private generateSuggestions(
    documents: FetchedDocument[],
    dependencies: Record<string, string>,
    sourceLibraryMap: Map<string, string>
  ): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = []
    const now = Date.now()
    const seen = new Set<string>()

    for (const doc of documents) {
      if (!doc.sourceId.startsWith('registry-')) continue

      const library = sourceLibraryMap.get(doc.sourceId)
      if (!library || !dependencies[library]) continue

      try {
        const parsed = JSON.parse(doc.content)
        const latestVersion = parsed.version
        const currentVersion = dependencies[library]
        const diff = versionDiff(currentVersion, latestVersion)

        if (diff > 0) {
          const dedupeKey = `${library}@${latestVersion}`
          if (seen.has(dedupeKey)) continue
          seen.add(dedupeKey)

          const severity = diff >= SEVERE_BEHIND ? 'error' : diff >= WARNING_BEHIND ? 'warning' : 'info'
          suggestions.push({
            id: `dep-${library}-${latestVersion}-${now}`,
            sourceId: doc.sourceId,
            severity,
            library,
            currentVersion,
            latestVersion,
            title: `${library} is ${diff} version(s) behind latest`,
            description: `Current: ${currentVersion}. Latest: ${latestVersion}. Consider upgrading to pick up bug fixes, security patches, and new features.`,
            createdAt: now,
          })
        }
      } catch {
        // Ignore registry parse errors
      }
    }

    return suggestions
  }

  private ensureDir(): void {
    if (!existsSync(this.refreshDir)) {
      mkdirSync(this.refreshDir, { recursive: true })
    }
  }

  private loadCache(): RefreshCache {
    if (!existsSync(this.cachePath)) {
      return { version: 1, lastRefreshAt: 0, documents: [] }
    }
    try {
      return JSON.parse(readFileSync(this.cachePath, 'utf-8')) as RefreshCache
    } catch {
      return { version: 1, lastRefreshAt: 0, documents: [] }
    }
  }

  private saveCache(cache: RefreshCache): void {
    writeFileSync(this.cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  }

  private loadSuggestions(): SuggestionStore {
    if (!existsSync(this.suggestionsPath)) {
      return { version: 1, suggestions: [], lastRefreshAt: 0 }
    }
    try {
      return JSON.parse(readFileSync(this.suggestionsPath, 'utf-8')) as SuggestionStore
    } catch {
      return { version: 1, suggestions: [], lastRefreshAt: 0 }
    }
  }

  private saveSuggestions(store: SuggestionStore): void {
    writeFileSync(this.suggestionsPath, JSON.stringify(store, null, 2), 'utf-8')
  }
}

function parseVersion(version: string): number[] {
  const cleaned = version.replace(/^[~^]/, '').replace(/-.*/, '')
  return cleaned.split('.').map(Number).filter(n => !Number.isNaN(n))
}

function versionDiff(current: string, latest: string): number {
  const currentParts = parseVersion(current)
  const latestParts = parseVersion(latest)

  if (currentParts.length === 0 || latestParts.length === 0) return 0

  const currentMajor = currentParts[0] || 0
  const latestMajor = latestParts[0] || 0
  const currentMinor = currentParts[1] || 0
  const latestMinor = latestParts[1] || 0

  // 0.x releases treat minor bumps as the meaningful step.
  if (currentMajor === 0 && latestMajor === 0) {
    return Math.max(0, latestMinor - currentMinor)
  }

  if (latestMajor > currentMajor) {
    return latestMajor - currentMajor
  }
  if (latestMajor < currentMajor) {
    return 0
  }

  // Same major on a stable release: surface minor bumps, which is where
  // bug and security fixes usually land.
  return latestMinor > currentMinor ? 1 : 0
}

export function versionDiffForTests(current: string, latest: string): number {
  return versionDiff(current, latest)
}
