/**
 * npm maintenance signals for bundle-size replacement suggestions.
 *
 * Best-effort, offline-tolerant enrichment: for the heaviest packages in the
 * bundle we fetch last-publish date + latest version (registry metadata),
 * weekly downloads (npm downloads API), and GitHub stars (when the repository
 * is on GitHub). Every call has a short timeout, never throws, and the whole
 * set is cached on disk (`.vectalon/bundle/signals.json`) for 24h so repeated
 * runs are fast and CI stays quiet.
 *
 * GitHub's unauthenticated rate limit (60 req/h) is the binding constraint —
 * stars are only fetched for the top handful of packages per run.
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { bestEffortAsync } from './safe'

export interface PackageSignals {
  /** Latest published version (dist-tags.latest). */
  version?: string
  /** ISO date of the most recent publish. */
  lastPublish?: string
  /** Downloads in the last week (npm downloads API). */
  weeklyDownloads?: number
  /** GitHub stars, when the repo is on GitHub and within rate limits. */
  githubStars?: number
  license?: string
  /** npm page URL, for the dashboard card link. */
  npmUrl: string
  /** GitHub repository URL when derivable. */
  githubUrl?: string
}

export interface KnownAlternative {
  /** Replacement package name. */
  to: string
  /** Why the swap helps (short, human). */
  reason: string
  /** Rough size delta claim, e.g. "~95% smaller". */
  savings: string
}

/**
 * Curated heavy-dependency → lighter/recommended alternative map. Kept small
 * and factual; packages not listed are still surfaced by size + signals alone.
 */
export const KNOWN_ALTERNATIVES: Record<string, KnownAlternative> = {
  moment: {
    to: 'dayjs',
    reason: 'moment is deprecated (unmaintained) and ships most of its 300+ KB as locale/plugin baggage',
    savings: '~90% smaller at runtime',
  },
  lodash: {
    to: 'lodash-es',
    reason: 'lodash-es is the same API but tree-shakeable — only the functions you import reach the bundle',
    savings: 'imports only what you use',
  },
  underscore: {
    to: 'lodash-es',
    reason: 'underscore is effectively unmaintained; lodash-es keeps the API and tree-shakes',
    savings: 'imports only what you use',
  },
  axios: {
    to: 'fetch (built-in) or ky',
    reason: 'react-native ships a global fetch — axios pulls a full HTTP client for a wrapper',
    savings: '~40 KB removed',
  },
  numeral: {
    to: 'Intl.NumberFormat',
    reason: 'numeral is deprecated; Intl.NumberFormat is built into Hermes and locale-aware',
    savings: '~70 KB removed',
  },
  uuid: {
    to: 'crypto.randomUUID',
    reason: 'Hermes ships crypto.randomUUID — no native-ish UUID package needed',
    savings: '~25 KB removed',
  },
  'react-native-keyboard-spacer': {
    to: 'KeyboardAvoidingView (built-in)',
    reason: 'the package is unmaintained and the RN core component does the same job',
    savings: 'one dependency less',
  },
  'react-native-vector-icons': {
    to: 'subset import or an SVG icon set',
    reason: 'it embeds 20+ font files; importing only the icon set you use (or SVG icons) slims the bundle',
    savings: 'fonts are ~100+ KB each',
  },
}

/** True when the package has a known lighter alternative. */
export function isSwapCandidate(name: string): boolean {
  return name in KNOWN_ALTERNATIVES
}

export function alternativeFor(name: string): KnownAlternative | undefined {
  return KNOWN_ALTERNATIVES[name]
}

const USER_AGENT = 'vectalon-rn-bundle-visualizer'
const CACHE_FILE = 'signals.json'
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** GitHub unauthenticated API budget per run — keeps us under 60 req/h. */
const STARS_FETCH_LIMIT = 6
const FETCH_TIMEOUT_MS = 3000

interface CachedSignals extends PackageSignals {
  fetchedAt: number
}

export type SignalsCache = Record<string, CachedSignals>

/** registry.npmjs.org package name (scoped names use %2F). */
function registryName(name: string): string {
  return name.replace('/', '%2F')
}

function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Parse a GitHub URL from npm `repository.url`; returns owner/repo or null. */
export function repoFromNpmUrl(url: string | undefined): { owner: string; repo: string } | null {
  if (!url) return null
  const m = url.match(/github\.com[:/]([^/]+)\/([^/#.]+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

interface RegistryMeta {
  'dist-tags'?: { latest?: string }
  time?: { modified?: string }
  license?: string | { type?: string }
  repository?: { url?: string } | string
}

/**
 * Fetch every maintenance signal for one package. Never throws — any failed
 * endpoint just comes back missing. `allowStars` gates the GitHub call so a
 * run-wide rate-limit budget is respected.
 */
export async function fetchPackageSignals(
  name: string,
  opts: { allowStars?: boolean } = {}
): Promise<PackageSignals> {
  const encoded = registryName(name)
  const [meta, downloads] = await Promise.all([
    fetchJson<RegistryMeta>(`https://registry.npmjs.org/${encoded}`),
    fetchJson<{ downloads?: number }>(`https://api.npmjs.org/downloads/point/last-week/${encoded}`),
  ])

  const signals: PackageSignals = {
    npmUrl: `https://www.npmjs.com/package/${name}`,
    version: meta?.['dist-tags']?.latest,
    lastPublish: meta?.time?.modified,
    license: typeof meta?.license === 'string' ? meta.license : meta?.license?.type,
  }

  const repository = meta?.repository
  const repoUrl = typeof repository === 'string' ? repository : repository?.url
  const repo = repoFromNpmUrl(repoUrl)
  if (repo) {
    signals.githubUrl = `https://github.com/${repo.owner}/${repo.repo}`
    if (opts.allowStars !== false) {
      const stars = await fetchJson<{ stargazers_count?: number }>(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}`
      )
      signals.githubStars = stars?.stargazers_count
    }
  }

  if (downloads && typeof downloads.downloads === 'number') {
    signals.weeklyDownloads = downloads.downloads
  }
  return signals
}

/** Read the on-disk signals cache (best-effort). */
export function readSignalsCache(root: string): SignalsCache {
  const path = join(root, '.vectalon', 'bundle', CACHE_FILE)
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as SignalsCache
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist the merged signals cache (best-effort). */
export function writeSignalsCache(root: string, cache: SignalsCache): void {
  try {
    const dir = join(root, '.vectalon', 'bundle')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, CACHE_FILE), JSON.stringify(cache, null, 2))
  } catch {
    // Cache writes must never break the run.
  }
}

/**
 * Resolve maintenance signals for the given packages, using fresh cache
 * entries and fetching only what is missing/stale. Never throws; returns a
 * map keyed by package name (subset of the input that had any data).
 */
export async function collectBundleSignals(
  root: string,
  packages: string[],
  opts: { maxAgeMs?: number; fetchLimit?: number } = {}
): Promise<SignalsCache> {
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const fetchLimit = opts.fetchLimit ?? 10
  const cache = readSignalsCache(root)
  const now = Date.now()

  const fresh = packages.filter(name => {
    const entry = cache[name]
    return entry && now - entry.fetchedAt <= maxAgeMs
  })
  const toFetch = packages.filter(name => !fresh.includes(name)).slice(0, fetchLimit)

  const merged: SignalsCache = { ...cache }
  for (const name of fresh) {
    if (merged[name]) merged[name].fetchedAt = now // rolling freshness: seen-again extends the TTL
  }

  // Stars are the rate-limited call — only the heaviest few packages get one.
  // The budget is reserved synchronously while mapping (before any await), so
  // parallel fetches cannot all pass the check.
  let starsBudget = STARS_FETCH_LIMIT
  await Promise.all(
    toFetch.map(async name => {
      const allowStars = starsBudget > 0
      if (allowStars) starsBudget -= 1
      const signals = await bestEffortAsync(
        () => fetchPackageSignals(name, { allowStars }),
        `npmSignals: fetching signals for ${name}`
      )
      if (!signals) return
      merged[name] = { ...signals, fetchedAt: now }
    })
  )

  writeSignalsCache(root, merged)
  return merged
}
