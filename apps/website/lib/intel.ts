/**
 * Live ecosystem intel for the homepage feed.
 *
 * Fetches four real sources server-side and merges them into one ticker:
 *   - React Native releases    (GitHub Releases API, follows the repo move
 *                               to react/react-native via redirect)
 *   - Expo changelog           (expo.dev RSS — the releases API returns [])
 *   - Hacker News              (Algolia search API, "react native" stories)
 *   - Trending RN repos        (GitHub Search API — top-starred repos with
 *                               the react-native topic, star counts per row)
 *
 * Each source degrades to a static seed row when the fetch fails or returns
 * nothing, so the pane never renders empty and the page never depends on a
 * third party being up. Fetches are cached with a 1h revalidate to match the
 * product's "re-seeds every hour" claim; the build also stays green offline.
 *
 * Pure normalizers are exported separately so the mapping logic is unit
 * testable without network access.
 */

export type IntelItem = {
  label: string
  source: string
  href?: string
  /** Optional secondary meta rendered on the row — e.g. repo star counts. */
  meta?: string
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 6000
const REVALIDATE_SEC = 3600
const RN_LIMIT = 5
const EXPO_LIMIT = 5
const HN_LIMIT = 8
const TRENDING_LIMIT = 6

const RN_RELEASES_URL =
  'https://api.github.com/repos/react/react-native/releases?per_page=' + RN_LIMIT
const EXPO_RSS_URL = 'https://expo.dev/changelog/rss.xml'
const HN_SEARCH_URL =
  'https://hn.algolia.com/api/v1/search?query=react%20native&tags=story&hitsPerPage=' + HN_LIMIT
const TRENDING_URL =
  'https://api.github.com/search/repositories?q=react-native+in:name,description+topic:react-native&sort=stars&order=desc&per_page=10'

/** Static seed rows — one per source — used when a fetch fails or is empty. */
export const INTEL_SEEDS: Record<'rn' | 'expo' | 'hn' | 'trending', IntelItem[]> = {
  rn: [{ label: 'RN 0.87-rc', source: 'RN releases' }],
  expo: [{ label: 'Expo SDK 57', source: 'Expo changelog' }],
  hn: [{ label: 'HN "React Native"', source: 'Algolia API' }],
  trending: [{ label: 'trending RN repos', source: 'GitHub Search' }],
}

/* ---------------------------------- fetchers ---------------------------------- */

async function fetchWithTimeout(fetchImpl: FetchImpl, url: string, init: RequestInit = {}) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, {
      ...init,
      signal: ac.signal,
      next: { revalidate: REVALIDATE_SEC },
    } as RequestInit)
    if (!res.ok) throw new Error(`intel ${res.status} for ${url}`)
    return res
  } finally {
    clearTimeout(t)
  }
}

async function fetchJson(fetchImpl: FetchImpl, url: string, init?: RequestInit) {
  const res = await fetchWithTimeout(fetchImpl, url, init)
  return res.json()
}

async function fetchRnReleases(fetchImpl: FetchImpl): Promise<IntelItem[]> {
  const data = await fetchJson(fetchImpl, RN_RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vectalon-website' },
  })
  return normalizeRnReleases(data)
}

async function fetchExpoChangelog(fetchImpl: FetchImpl): Promise<IntelItem[]> {
  const res = await fetchWithTimeout(fetchImpl, EXPO_RSS_URL)
  return parseExpoRss(await res.text())
}

async function fetchHnStories(fetchImpl: FetchImpl): Promise<IntelItem[]> {
  const data = await fetchJson(fetchImpl, HN_SEARCH_URL)
  return normalizeHnHits(data)
}

async function fetchTrendingRepos(fetchImpl: FetchImpl): Promise<IntelItem[]> {
  const data = await fetchJson(fetchImpl, TRENDING_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vectalon-website' },
  })
  return normalizeTrendingRepos(data)
}

/* --------------------------------- normalizers --------------------------------- */

export function normalizeRnReleases(data: unknown): IntelItem[] {
  if (!Array.isArray(data)) return []
  return data
    .slice(0, RN_LIMIT)
    .flatMap((r): IntelItem[] => {
      if (!r || typeof r !== 'object') return []
      const { name, tag_name, html_url } = r as Record<string, unknown>
      const raw =
        typeof name === 'string' && name ? name : typeof tag_name === 'string' ? tag_name : ''
      const version = raw.replace(/^v/, '')
      if (!version) return []
      return [
        {
          label: `RN ${version}`,
          source: 'RN releases',
          href: typeof html_url === 'string' ? html_url : undefined,
        },
      ]
    })
}

/** Minimal RSS item extraction — title (CDATA-aware) and link per <item>. */
export function parseExpoRss(xml: string): IntelItem[] {
  const items: IntelItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null && items.length < EXPO_LIMIT) {
    const block = m[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    if (!title) continue
    items.push({
      label: truncate(decodeEntities(title), 48),
      source: 'Expo changelog',
      href: link || undefined,
    })
  }
  return items
}

export function normalizeHnHits(data: unknown): IntelItem[] {
  if (!data || typeof data !== 'object') return []
  const hits = (data as { hits?: unknown }).hits
  if (!Array.isArray(hits)) return []
  return hits.slice(0, HN_LIMIT).flatMap((h): IntelItem[] => {
    if (!h || typeof h !== 'object') return []
    const { title, objectID } = h as Record<string, unknown>
    if (typeof title !== 'string' || !title) return []
    const href =
      typeof objectID === 'string' && objectID
        ? `https://news.ycombinator.com/item?id=${objectID}`
        : undefined
    return [{ label: truncate(decodeEntities(title), 48), source: 'Hacker News', href }]
  })
}

export function normalizeTrendingRepos(data: unknown): IntelItem[] {
  if (!data || typeof data !== 'object') return []
  const items = (data as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items.slice(0, TRENDING_LIMIT).flatMap((r): IntelItem[] => {
    if (!r || typeof r !== 'object') return []
    const { full_name, stargazers_count, html_url } = r as Record<string, unknown>
    if (typeof full_name !== 'string' || !full_name) return []
    const stars = typeof stargazers_count === 'number' ? stargazers_count : 0
    return [
      {
        label: full_name,
        source: 'GitHub Search',
        href: typeof html_url === 'string' ? html_url : undefined,
        meta: formatStars(stars),
      },
    ]
  })
}

/* ------------------------------------ utils ------------------------------------ */

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`)
  const m = re.exec(block)
  return m ? m[1].trim() : ''
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

/** Compact star counts, GitHub-style: 126343 → "126k", 51600 → "51.6k", 908 → "908". */
export function formatStars(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (count >= 100_000) return `${Math.round(count / 1_000)}k`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(count)
}

/* ------------------------------------ main ------------------------------------ */

/**
 * Fetch all four sources in parallel; each degrades to its seed row on
 * failure, so the merged feed is never empty. Ordered rn → expo → hn → trending.
 */
export async function fetchIntelFeed(fetchImpl: FetchImpl = fetch): Promise<IntelItem[]> {
  const [rn, expo, hn, trending] = await Promise.allSettled([
    fetchRnReleases(fetchImpl),
    fetchExpoChangelog(fetchImpl),
    fetchHnStories(fetchImpl),
    fetchTrendingRepos(fetchImpl),
  ])

  const rnItems = rn.status === 'fulfilled' && rn.value.length > 0 ? rn.value : INTEL_SEEDS.rn
  const expoItems =
    expo.status === 'fulfilled' && expo.value.length > 0 ? expo.value : INTEL_SEEDS.expo
  const hnItems = hn.status === 'fulfilled' && hn.value.length > 0 ? hn.value : INTEL_SEEDS.hn
  const trendingItems =
    trending.status === 'fulfilled' && trending.value.length > 0
      ? trending.value
      : INTEL_SEEDS.trending
  return [...rnItems, ...expoItems, ...hnItems, ...trendingItems]
}
