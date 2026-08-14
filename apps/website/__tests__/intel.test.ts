import {
  fetchIntelFeed,
  formatStars,
  normalizeHnHits,
  normalizeRnReleases,
  normalizeTrendingRepos,
  parseExpoRss,
  type FetchImpl,
  type IntelItem,
} from '../lib/intel'

const RN_FIXTURE = [
  { name: '0.87.0', tag_name: 'v0.87.0', html_url: 'https://github.com/react/react-native/releases/tag/v0.87.0' },
  { name: '0.86.2', tag_name: 'v0.86.2', html_url: 'https://github.com/react/react-native/releases/tag/v0.86.2' },
  { name: '', tag_name: 'v0.86.0', html_url: 'https://github.com/react/react-native/releases/tag/v0.86.0' },
  { name: null, tag_name: 'v0.85.3', html_url: 'https://github.com/react/react-native/releases/tag/v0.85.3' },
  { name: '0.85.2', tag_name: 'v0.85.2', html_url: 'https://github.com/react/react-native/releases/tag/v0.85.2' },
  { name: '0.85.1', tag_name: 'v0.85.1', html_url: 'https://github.com/react/react-native/releases/tag/v0.85.1' },
]

const EXPO_RSS_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Expo changelog</title>
    <item>
      <title><![CDATA[Connect Expo in the Claude desktop app]]></title>
      <link>https://expo.dev/changelog/connect-expo-in-claude</link>
    </item>
    <item>
      <title><![CDATA[Expo SDK 57 is now available]]></title>
      <link>https://expo.dev/changelog/expo-sdk-57</link>
    </item>
    <item>
      <title>Plain title without CDATA</title>
      <link>https://expo.dev/changelog/plain</link>
    </item>
  </channel>
</rss>`

const HN_FIXTURE = {
  hits: [
    { title: 'React Native is now open source', objectID: '9271246', url: 'https://github.com/facebook/react-native' },
    { title: 'React Native at Airbnb', objectID: '11711535' },
    { title: '', objectID: '0' },
    { title: 'The 2026 State of React Native', objectID: '44198231', url: 'https://stateofrn.dev' },
  ],
}

const TRENDING_FIXTURE = {
  items: [
    { full_name: 'react/react-native', stargazers_count: 126343, html_url: 'https://github.com/react/react-native' },
    { full_name: 'expo/expo', stargazers_count: 51600, html_url: 'https://github.com/expo/expo' },
    { full_name: 'react-hook-form/react-hook-form', stargazers_count: 44823, html_url: 'https://github.com/react-hook-form/react-hook-form' },
    { full_name: 'react-navigation/react-navigation', stargazers_count: 24490, html_url: 'https://github.com/react-navigation/react-navigation' },
    { full_name: 'necolas/react-native-web', stargazers_count: 22140, html_url: 'https://github.com/necolas/react-native-web' },
    { full_name: 'no-stars/repo', stargazers_count: 908, html_url: 'https://github.com/no-stars/repo' },
    // empty-name entries are skipped, and don't consume the cap
    { full_name: '', stargazers_count: 900, html_url: 'https://github.com/x/y' },
  ],
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(routes: Record<string, () => Response>): FetchImpl {
  return (url: string) => {
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    if (!hit) throw new Error(`unexpected url: ${url}`)
    return Promise.resolve(hit[1]())
  }
}

describe('normalizeRnReleases', () => {
  it('maps releases to labeled items with hrefs, capped at the limit', () => {
    const items = normalizeRnReleases(RN_FIXTURE)
    expect(items).toHaveLength(5)
    expect(items[0]).toEqual({
      label: 'RN 0.87.0',
      source: 'RN releases',
      href: 'https://github.com/react/react-native/releases/tag/v0.87.0',
    })
    // falls back to tag_name when name is empty, strips leading v
    expect(items[2].label).toBe('RN 0.86.0')
    expect(items[3].label).toBe('RN 0.85.3')
  })

  it('returns [] for non-array or malformed payloads', () => {
    expect(normalizeRnReleases(null)).toEqual([])
    expect(normalizeRnReleases('nope')).toEqual([])
    expect(normalizeRnReleases([{ tag_name: 42 }])).toEqual([])
  })
})

describe('parseExpoRss', () => {
  it('extracts CDATA and plain titles with links', () => {
    const items = parseExpoRss(EXPO_RSS_FIXTURE)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({
      label: 'Connect Expo in the Claude desktop app',
      source: 'Expo changelog',
      href: 'https://expo.dev/changelog/connect-expo-in-claude',
    })
    expect(items[1].label).toBe('Expo SDK 57 is now available')
    expect(items[2].label).toBe('Plain title without CDATA')
  })

  it('decodes entities and truncates long titles', () => {
    const long = `<rss><channel><item><title><![CDATA[${'x'.repeat(200)}]]></title><link>https://e.dev/a</link></item></channel></rss>`
    const items = parseExpoRss(long)
    expect(items[0].label).toHaveLength(48) // 47 chars + ellipsis
    expect(items[0].label.endsWith('…')).toBe(true)

    const ent = parseExpoRss('<rss><channel><item><title>Foo &amp; Bar &#39;quoted&#39;</title><link>https://e.dev/b</link></item></channel></rss>')
    expect(ent[0].label).toBe("Foo & Bar 'quoted'")
  })

  it('returns [] for non-xml input', () => {
    expect(parseExpoRss('')).toEqual([])
    expect(parseExpoRss('plain text')).toEqual([])
  })
})

describe('normalizeHnHits', () => {
  it('maps hits to HN discussion links', () => {
    const items = normalizeHnHits(HN_FIXTURE)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({
      label: 'React Native is now open source',
      source: 'Hacker News',
      href: 'https://news.ycombinator.com/item?id=9271246',
    })
    expect(items[1].href).toBe('https://news.ycombinator.com/item?id=11711535')
  })

  it('returns [] for empty or malformed payloads', () => {
    expect(normalizeHnHits({ hits: [] })).toEqual([])
    expect(normalizeHnHits(null)).toEqual([])
    expect(normalizeHnHits({})).toEqual([])
  })
})

describe('normalizeTrendingRepos', () => {
  it('maps repos to items with formatted star counts, capped at the limit', () => {
    const items = normalizeTrendingRepos(TRENDING_FIXTURE)
    expect(items).toHaveLength(6) // skips the empty-name entry, caps at 6
    expect(items[0]).toEqual({
      label: 'react/react-native',
      source: 'GitHub Search',
      href: 'https://github.com/react/react-native',
      meta: '126k',
    })
    expect(items[1].meta).toBe('51.6k')
    expect(items[2].meta).toBe('44.8k')
    expect(items[3].meta).toBe('24.5k')
    expect(items[5].meta).toBe('908')
  })

  it('skips empty-name entries without consuming the cap', () => {
    const items = normalizeTrendingRepos({
      items: [{ full_name: 'a/b', stargazers_count: 100 }, { full_name: '' }, { full_name: 'c/d', stargazers_count: 200 }],
    })
    expect(items).toHaveLength(2)
    expect(items.map(i => i.label)).toEqual(['a/b', 'c/d'])
  })

  it('returns [] for empty or malformed payloads', () => {
    expect(normalizeTrendingRepos({ items: [] })).toEqual([])
    expect(normalizeTrendingRepos(null)).toEqual([])
    expect(normalizeTrendingRepos({})).toEqual([])
  })
})

describe('formatStars', () => {
  it('compacts star counts', () => {
    expect(formatStars(126343)).toBe('126k')
    expect(formatStars(100000)).toBe('100k')
    expect(formatStars(51600)).toBe('51.6k')
    expect(formatStars(44823)).toBe('44.8k')
    expect(formatStars(1000000)).toBe('1m')
    expect(formatStars(1500000)).toBe('1.5m')
    expect(formatStars(908)).toBe('908')
    expect(formatStars(0)).toBe('0')
  })
})

describe('fetchIntelFeed', () => {
  it('merges all four sources in order when every fetch succeeds', async () => {
    const fetchImpl = stubFetch({
      'https://api.github.com/repos/react/react-native/releases': () => okJson(RN_FIXTURE),
      'https://expo.dev/changelog/rss.xml': () => new Response(EXPO_RSS_FIXTURE, { status: 200 }),
      'https://hn.algolia.com/api/v1/search': () => okJson(HN_FIXTURE),
      'https://api.github.com/search/repositories': () => okJson(TRENDING_FIXTURE),
    })
    const items = await fetchIntelFeed(fetchImpl)
    expect(items.map(i => i.source)).toEqual([
      'RN releases',
      'RN releases',
      'RN releases',
      'RN releases',
      'RN releases',
      'Expo changelog',
      'Expo changelog',
      'Expo changelog',
      'Hacker News',
      'Hacker News',
      'Hacker News',
      'GitHub Search',
      'GitHub Search',
      'GitHub Search',
      'GitHub Search',
      'GitHub Search',
      'GitHub Search',
    ])
    expect(items[0].label).toBe('RN 0.87.0')
    expect(items[11].meta).toBe('126k')
    expect(items[12].meta).toBe('51.6k')
  })

  it('falls back to seed rows when a source fails, keeping the others live', async () => {
    const fetchImpl = stubFetch({
      'https://api.github.com/repos/react/react-native/releases': () => okJson(RN_FIXTURE),
      // expo and hn endpoints are left out → throw
      'https://expo.dev/changelog/rss.xml': () => {
        throw new Error('rss down')
      },
      'https://hn.algolia.com/api/v1/search': () => okJson(HN_FIXTURE),
    })
    const items = await fetchIntelFeed(fetchImpl)
    expect(items).toContainEqual({ label: 'RN 0.87.0', source: 'RN releases', href: expect.any(String) })
    expect(items).toContainEqual({ label: 'Expo SDK 57', source: 'Expo changelog', href: undefined })
    expect(items).toContainEqual({ label: 'React Native is now open source', source: 'Hacker News', href: expect.any(String) })
    // live RN + seed expo + live HN + seed trending (route not stubbed → throws)
    expect(items).toContainEqual({ label: 'trending RN repos', source: 'GitHub Search', href: undefined })
    expect(items.filter(i => i.source === 'RN releases')).toHaveLength(5)
    expect(items.filter(i => i.source === 'Expo changelog')).toHaveLength(1)
    expect(items.filter(i => i.source === 'Hacker News')).toHaveLength(3)
    expect(items.filter(i => i.source === 'GitHub Search')).toHaveLength(1)
  })

  it('returns all seed rows when every source fails, and never rejects', async () => {
    const fetchImpl = stubFetch({}) // everything throws
    const items = await fetchIntelFeed(fetchImpl)
    const seeds = items.filter(i => !i.href)
    expect(seeds.map(i => i.label)).toEqual([
      'RN 0.87-rc',
      'Expo SDK 57',
      'HN "React Native"',
      'trending RN repos',
    ])
    expect(items).toHaveLength(4)
  })

  it('degrades an empty successful response to the seed', async () => {
    const fetchImpl = stubFetch({
      'https://api.github.com/repos/react/react-native/releases': () => okJson([]),
      'https://expo.dev/changelog/rss.xml': () => okJson([]),
      'https://hn.algolia.com/api/v1/search': () => okJson({ hits: [] }),
      'https://api.github.com/search/repositories': () => okJson({ items: [] }),
    })
    const items = await fetchIntelFeed(fetchImpl)
    expect(items).toEqual([
      { label: 'RN 0.87-rc', source: 'RN releases' },
      { label: 'Expo SDK 57', source: 'Expo changelog' },
      { label: 'HN "React Native"', source: 'Algolia API' },
      { label: 'trending RN repos', source: 'GitHub Search' },
    ] satisfies IntelItem[])
  })
})
