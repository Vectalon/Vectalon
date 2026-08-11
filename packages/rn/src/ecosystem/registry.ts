/**
 * npm registry validation for ecosystem catalog entries.
 *
 * The catalog hardcodes `npx <package>` install commands; a stale or wrong
 * name only surfaces as a wall of npm 404 output at serve time. This module
 * validates a package's existence against the registry up front — fail-fast at
 * `vectalon ecosystem --enable`, and as a doctor check — with a 24h on-disk
 * cache (`.vectalon/ecosystem/registry-cache.json`) so repeated runs are fast
 * and CI-quiet.
 *
 * The registry is authoritative: a confirmed HTTP 404 means the package does
 * not exist. A network failure is *not* treated as "does not exist" — it is
 * marked unverified so callers can degrade to "proceed" instead of blocking
 * offline users.
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fetchWithTimeout } from '../utils/http'

export interface RegistryCheck {
  /** False only on a confirmed registry 404. */
  exists: boolean
  /** True when the registry answered (404 or 200); false when offline/failed. */
  verified: boolean
  /** Latest version, when the registry answered. */
  latestVersion?: string
  /** Epoch ms the check was performed (0 when unverified). */
  checkedAt: number
}

export type RegistryCache = Record<string, RegistryCheck>

const CACHE_FILE = 'registry-cache.json'
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** registry.npmjs.org package name (scoped names use %2F). */
function registryName(name: string): string {
  return name.replace('/', '%2F')
}

/** Read the on-disk registry cache (best-effort). */
export function readRegistryCache(root: string): RegistryCache {
  const path = join(root, '.vectalon', 'ecosystem', CACHE_FILE)
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as RegistryCache
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist the registry cache (best-effort). */
export function writeRegistryCache(root: string, cache: RegistryCache): void {
  try {
    const dir = join(root, '.vectalon', 'ecosystem')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, CACHE_FILE), JSON.stringify(cache, null, 2))
  } catch {
    // Cache writes must never break the run.
  }
}

/**
 * Check one package against the registry. Uses a fresh cache entry when
 * present; otherwise fetches `registry.npmjs.org/<name>/latest` (3s timeout).
 * Never throws. Unverified results are never cached, so an offline run simply
 * retries next time instead of pinning a stale "unknown".
 */
export async function checkPackageOnRegistry(
  name: string,
  opts: { cache?: RegistryCache; maxAgeMs?: number } = {}
): Promise<RegistryCheck> {
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const cached = opts.cache?.[name]
  if (cached && cached.verified && Date.now() - cached.checkedAt <= maxAgeMs) {
    return cached
  }

  let response: Response | null = null
  try {
    response = await fetchWithTimeout(`https://registry.npmjs.org/${registryName(name)}/latest`)
  } catch {
    response = null
  }

  if (!response) {
    return { exists: true, verified: false, checkedAt: 0 }
  }
  if (response.status === 404) {
    return { exists: false, verified: true, checkedAt: Date.now() }
  }
  if (!response.ok) {
    // 5xx / rate-limit — not evidence the package is missing.
    return { exists: true, verified: false, checkedAt: 0 }
  }

  let latestVersion: string | undefined
  try {
    const body = (await response.json()) as { version?: unknown }
    if (typeof body.version === 'string') latestVersion = body.version
  } catch {
    // Version is optional; existence is what matters.
  }
  return { exists: true, verified: true, latestVersion, checkedAt: Date.now() }
}

/**
 * Convenience for a single check that also persists the result: reads the
 * cache, checks, writes back. Used by `vectalon ecosystem --enable`.
 */
export async function verifyPackageOnRegistry(name: string, root: string): Promise<RegistryCheck> {
  const cache = readRegistryCache(root)
  const check = await checkPackageOnRegistry(name, { cache })
  if (check.verified) {
    writeRegistryCache(root, { ...cache, [name]: check })
  }
  return check
}

/**
 * Check many packages (cache-first, parallel, offline-tolerant) and persist
 * the merged cache. Returns a map keyed by package name. Used by the doctor
 * CLI before rendering the catalog-health check.
 */
export async function checkCatalogPackagesOnRegistry(
  packageNames: string[],
  opts: { root?: string; maxAgeMs?: number } = {}
): Promise<Record<string, RegistryCheck>> {
  const root = opts.root
  const cache = root ? readRegistryCache(root) : {}
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = Date.now()

  const fresh: Record<string, RegistryCheck> = {}
  const toFetch: string[] = []
  for (const name of packageNames) {
    const entry = cache[name]
    if (entry && entry.verified && now - entry.checkedAt <= maxAgeMs) {
      fresh[name] = entry
    } else {
      toFetch.push(name)
    }
  }

  await Promise.all(
    toFetch.map(async name => {
      const check = await checkPackageOnRegistry(name, { cache })
      fresh[name] = check
      if (check.verified) cache[name] = check
    })
  )

  if (root) writeRegistryCache(root, cache)
  return fresh
}
