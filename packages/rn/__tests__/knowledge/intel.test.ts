import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractIntelItems, collectIntel } from '../../src/knowledge/refresh/intel'
import { defaultSources } from '../../src/knowledge/refresh/sources'
import { KnowledgeRefreshService } from '../../src/knowledge/refresh/KnowledgeRefreshService'
import { StubWebFetcher } from '../../src/knowledge/refresh/fetchers'
import { readCachedIntel, formatIntelContext, buildWebIntelSystemPrompt, enrichWithIntel } from '../../src/knowledge/intel'

const RSS = `<?xml version="1.0"?>
<rss><channel>
  <title>RN Blog</title>
  <item><title>React Native 0.82</title><link>https://reactnative.dev/blog/2026/0.82</link><pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate></item>
  <item><title>New Architecture by default</title><link>https://reactnative.dev/blog/new-arch</link><pubDate>Wed, 05 Aug 2026 00:00:00 GMT</pubDate></item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?>
<feed>
  <entry><title>Expo SDK 54</title><link href="https://github.com/expo/expo/releases/tag/sdk-54"/><updated>2026-08-01T00:00:00Z</updated></entry>
</feed>`

const HN_JSON = JSON.stringify({
  hits: [
    { title: 'Show HN: A React Native simulator', url: 'https://example.com/rn-sim', created_at: '2026-08-05T10:00:00Z', objectID: '49200001' },
    { title: 'React Native 0.82 discussion thread', url: '', created_at: '2026-08-04T10:00:00Z', objectID: '49199999' },
  ],
})

const GH_JSON = JSON.stringify({
  total_count: 2,
  items: [
    { full_name: 'expo/expo', html_url: 'https://github.com/expo/expo', created_at: '2026-08-01T00:00:00Z' },
    { full_name: 'callstack/react-native-builder-bob', html_url: 'https://github.com/callstack/react-native-builder-bob', created_at: '2026-07-01T00:00:00Z' },
  ],
})

describe('web intel sources', () => {
  it('includes the new community/trending sources in the default catalog', () => {
    const ids = defaultSources.map(s => s.id)
    expect(ids).toEqual(expect.arrayContaining(['hn-react-native', 'github-trending-rn', 'callstack-report']))
    for (const id of ['hn-react-native', 'github-trending-rn', 'callstack-report']) {
      const source = defaultSources.find(s => s.id === id)!
      expect(source.type).toBe('news')
      expect(source.urls.length).toBeGreaterThan(0)
    }
  })
})

describe('intel extraction', () => {
  const newsSource = { id: 'rn-releases', name: 'RN Releases', description: '', urls: [], refreshIntervalMs: 0, type: 'news' as const }

  it('extracts RSS items with title, link, and date', () => {
    const items = extractIntelItems(newsSource, RSS, 1000)
    expect(items).toHaveLength(2)
    // Newest-first ordering: Aug 5 before Aug 3.
    expect(items[0].title).toBe('New Architecture by default')
    expect(items[0].url).toBe('https://reactnative.dev/blog/new-arch')
    expect(items[0].publishedAt).toContain('05 Aug')
    expect(items[1].title).toBe('React Native 0.82')
    expect(items[1].publishedAt).toContain('03 Aug')
  })

  it('extracts Atom entries', () => {
    const items = extractIntelItems({ ...newsSource, id: 'expo-changelog', name: 'Expo' }, ATOM, 2000)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Expo SDK 54')
    expect(items[0].url).toContain('sdk-54')
  })

  it('extracts Hacker News Algolia JSON hits (title + url + date, item-page fallback for missing url)', () => {
    const items = extractIntelItems(newsSource, HN_JSON, 1000)
    expect(items).toHaveLength(2)
    expect(items[0].title).toContain('React Native simulator')
    expect(items[0].url).toBe('https://example.com/rn-sim')
    expect(items[0].publishedAt).toContain('2026-08-05')
    // No external url → the HN item page derived from objectID.
    expect(items[1].url).toBe('https://news.ycombinator.com/item?id=49199999')
  })

  it('extracts GitHub search JSON items (full_name + html_url + date)', () => {
    const items = extractIntelItems(newsSource, GH_JSON, 2000)
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('expo/expo')
    expect(items[0].url).toBe('https://github.com/expo/expo')
    expect(items[0].publishedAt).toContain('2026-08-01')
    expect(items[1].title).toBe('callstack/react-native-builder-bob')
  })

  it('returns no items for malformed JSON and falls back to HTML scraping', () => {
    const items = extractIntelItems(newsSource, '{not valid json', 0)
    expect(items).toHaveLength(0)
  })

  it('falls back to scraping HTML headings', () => {
    const html = `<html><body><h2><a href="https://reactnativeweekly.com/issue/1">Weekly #1: FlashList 2.0</a></h2><h2>Deep link to docs</h2></body></html>`
    const items = extractIntelItems(newsSource, html, 3000)
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].title).toContain('FlashList')
  })

  it('ignores non-news source types', () => {
    const items = extractIntelItems({ ...newsSource, type: 'docs' }, RSS, 0)
    expect(items).toHaveLength(0)
  })

  it('dedupes by normalized title', () => {
    const items = extractIntelItems(newsSource, `${RSS}${RSS}`, 0)
    expect(items).toHaveLength(2)
  })

  it('collectIntel aggregates across documents', () => {
    const docs = [
      { sourceId: 'rn-releases', url: 'x', fetchedAt: 0, content: RSS, statusCode: 200 },
      { sourceId: 'expo-changelog', url: 'y', fetchedAt: 0, content: ATOM, statusCode: 200 },
    ]
    const sourceOf = (id: string) => (id === 'rn-releases' ? newsSource : { ...newsSource, id: 'expo-changelog', name: 'Expo' })
    const items = collectIntel(docs as never, sourceOf)
    expect(items).toHaveLength(3)
  })
})

describe('web intel model prompt', () => {
  let dir: string

  beforeEach(() => {
    dir = join(tmpdir(), `vectalon-intel-${Date.now().toString(36)}`)
    mkdirSync(join(dir, '.vectalon', 'knowledge', 'refresh'), { recursive: true })
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('readCachedIntel reads the persisted store', () => {
    writeFileSync(
      join(dir, '.vectalon', 'knowledge', 'refresh', 'intel.json'),
      JSON.stringify({ version: 1, lastRefreshAt: 1, items: [{ title: 'RN 0.82', url: 'u', fetchedAt: 1 }] })
    )
    expect(readCachedIntel(dir)).toHaveLength(1)
  })

  it('returns [] when no cache exists', () => {
    rmSync(join(dir, '.vectalon'), { recursive: true, force: true })
    expect(readCachedIntel(dir)).toEqual([])
  })

  it('formatIntelContext renders a dated headline section', () => {
    const items = [{ sourceId: 's', sourceName: 'RN', title: 'RN 0.82', url: 'https://u', publishedAt: '2026-08-03T00:00:00Z', fetchedAt: Date.now() }]
    const section = formatIntelContext(items)
    expect(section).toContain('## Latest React Native ecosystem intel')
    expect(section).toContain('RN 0.82')
    expect(section).toContain('https://u')
  })

  it('buildWebIntelSystemPrompt appends intel to the system prompt', () => {
    writeFileSync(
      join(dir, '.vectalon', 'knowledge', 'refresh', 'intel.json'),
      JSON.stringify({ version: 1, lastRefreshAt: 1, items: [{ title: 'RN 0.82', url: 'u', fetchedAt: Date.now() }] })
    )
    const out = buildWebIntelSystemPrompt(dir, 'You are a senior RN engineer.')
    expect(out).toContain('You are a senior RN engineer.')
    expect(out).toContain('RN 0.82')
  })

  it('returns the system prompt unchanged when no intel is cached', () => {
    rmSync(join(dir, '.vectalon'), { recursive: true, force: true })
    expect(buildWebIntelSystemPrompt(dir, 'Keep me')).toBe('Keep me')
  })

  it('enrichWithIntel no-ops without a project root', () => {
    const loader = jest.fn()
    expect(enrichWithIntel(undefined, loader, 'base')).toBe('base')
    expect(loader).not.toHaveBeenCalled()
  })

  it('KnowledgeRefreshService persists intel and exposes it', async () => {
    const fetcher = new StubWebFetcher({
      'https://github.com/facebook/react-native/releases.atom': ATOM,
    })
    const service = new KnowledgeRefreshService({
      projectRoot: dir,
      fetcher,
      sources: [{ id: 'rn-releases', name: 'RN Releases', description: '', urls: ['https://github.com/facebook/react-native/releases.atom'], refreshIntervalMs: 0, type: 'news' }],
    })
    const result = await service.refresh({ projectRoot: dir, force: true })
    expect(result.intel).toHaveLength(1)
    expect(service.getIntel()).toHaveLength(1)
    expect(service.getIntelFetchedAt()).toBeGreaterThan(0)
    expect(readCachedIntel(dir)).toHaveLength(1)
  })
})