/**
 * Registry validation module — `src/ecosystem/registry.ts`.
 *
 * The npm registry is authoritative: a confirmed HTTP 404 means the package
 * does not exist; a network failure is *not* treated as "does not exist".
 * These tests lock in the cache behavior, the verified/exists semantics, and
 * the catalog-integrity checks (the network sweep is gated behind
 * RUN_CATALOG_NETWORK=1 so CI stays offline-deterministic).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  checkPackageOnRegistry,
  checkCatalogPackagesOnRegistry,
  readRegistryCache,
  writeRegistryCache,
  verifyPackageOnRegistry,
  type RegistryCheck,
} from '../../src/ecosystem/registry'
import { listEcosystemItems, ECOSYSTEM_CATALOG } from '../../src/ecosystem/catalog'

/** Stub global fetch with a canned status/body. Restore in afterEach. */
function stubFetch(status: number, body?: unknown, failWith?: Error): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (failWith) throw failWith
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response
  })
}

describe('checkPackageOnRegistry', () => {
  afterEach(() => jest.restoreAllMocks())

  it('reports exists + verified with the latest version on a 200', async () => {
    stubFetch(200, { version: '1.2.3' })
    const check = await checkPackageOnRegistry('metro-mcp')
    expect(check.exists).toBe(true)
    expect(check.verified).toBe(true)
    expect(check.latestVersion).toBe('1.2.3')
    expect(check.checkedAt).toBeGreaterThan(0)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/metro-mcp/latest',
      expect.objectContaining({ signal: expect.anything() })
    )
  })

  it('reports !exists + verified on a confirmed 404', async () => {
    stubFetch(404)
    const check = await checkPackageOnRegistry('not-a-real-package-xyz')
    expect(check.exists).toBe(false)
    expect(check.verified).toBe(true)
    expect(check.latestVersion).toBeUndefined()
  })

  it('encodes scoped package names with %2F', async () => {
    stubFetch(200, { version: '1.0.0' })
    await checkPackageOnRegistry('@ohah/react-native-mcp-server')
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toBe('https://registry.npmjs.org/@ohah%2Freact-native-mcp-server/latest')
  })

  it('never treats a network failure as "does not exist"', async () => {
    stubFetch(0, undefined, new Error('ENOTFOUND'))
    const check = await checkPackageOnRegistry('metro-mcp')
    expect(check.exists).toBe(true) // degrade-to-proceed, not false-404
    expect(check.verified).toBe(false)
    expect(check.checkedAt).toBe(0)
  })

  it('treats a 5xx as unverified (not evidence of absence)', async () => {
    stubFetch(503)
    const check = await checkPackageOnRegistry('metro-mcp')
    expect(check.exists).toBe(true)
    expect(check.verified).toBe(false)
  })

  it('returns a fresh cached entry without fetching', async () => {
    stubFetch(200, { version: '9.9.9' })
    const fresh: RegistryCheck = { exists: true, verified: true, latestVersion: '1.0.0', checkedAt: Date.now() }
    const check = await checkPackageOnRegistry('metro-mcp', { cache: { 'metro-mcp': fresh } })
    expect(check).toEqual(fresh)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('refetches stale cache entries', async () => {
    stubFetch(200, { version: '2.0.0' })
    const stale: RegistryCheck = { exists: true, verified: true, latestVersion: '1.0.0', checkedAt: Date.now() - 48 * 60 * 60 * 1000 }
    const check = await checkPackageOnRegistry('metro-mcp', {
      cache: { 'metro-mcp': stale },
      maxAgeMs: 24 * 60 * 60 * 1000,
    })
    expect(check.latestVersion).toBe('2.0.0')
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('never caches unverified results (offline retries next run)', async () => {
    stubFetch(0, undefined, new Error('offline'))
    const cache: Record<string, RegistryCheck> = {}
    await checkPackageOnRegistry('metro-mcp', { cache })
    expect(cache['metro-mcp']).toBeUndefined()
  })
})

describe('registry cache file', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-reg-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('round-trips through .vectalon/ecosystem/registry-cache.json', () => {
    const cache = { 'metro-mcp': { exists: true, verified: true, latestVersion: '1.0.0', checkedAt: 123 } }
    writeRegistryCache(dir, cache)
    expect(existsSync(join(dir, '.vectalon', 'ecosystem', 'registry-cache.json'))).toBe(true)
    expect(readRegistryCache(dir)).toEqual(cache)
  })

  it('returns {} when the cache file is missing or corrupt', () => {
    expect(readRegistryCache(dir)).toEqual({})
    mkdirSync(join(dir, '.vectalon', 'ecosystem'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'ecosystem', 'registry-cache.json'), 'not json', 'utf-8')
    expect(readRegistryCache(dir)).toEqual({})
  })

  it('verifyPackageOnRegistry persists a verified result', async () => {
    stubFetch(200, { version: '1.0.0' })
    const check = await verifyPackageOnRegistry('metro-mcp', dir)
    expect(check.verified).toBe(true)
    expect(readRegistryCache(dir)['metro-mcp']).toEqual(check)
  })

  it('checkCatalogPackagesOnRegistry merges fresh + fetched and persists', async () => {
    stubFetch(200, { version: '1.0.0' })
    const cache: Record<string, RegistryCheck> = {
      'metro-mcp': { exists: true, verified: true, latestVersion: '0.9.0', checkedAt: Date.now() },
    }
    writeRegistryCache(dir, cache)

    const result = await checkCatalogPackagesOnRegistry(['metro-mcp', 'expo-mcp'], { root: dir })
    expect(result['metro-mcp'].latestVersion).toBe('0.9.0') // fresh → cached
    expect(result['expo-mcp'].verified).toBe(true) // fetched
    // Persisted merge — both entries now on disk
    const onDisk = readRegistryCache(dir)
    expect(onDisk['metro-mcp'].latestVersion).toBe('0.9.0')
    expect(onDisk['expo-mcp'].verified).toBe(true)
  })
})

describe('catalog integrity', () => {
  it('every MCP item declares the npm package it installs', () => {
    const mcps = listEcosystemItems({ category: 'mcp' })
    expect(mcps.length).toBeGreaterThan(0)
    for (const item of mcps) {
      expect(item.packageName).toBeTruthy()
      expect(item.install).toMatch(/^npx\s/)
    }
  })

  it('every catalog install string parses into a command + args', () => {
    for (const item of ECOSYSTEM_CATALOG.items) {
      const parts = item.install.split(/\s+/).filter(Boolean)
      expect(parts.length).toBeGreaterThan(0)
      expect(parts[0]).toBeTruthy()
    }
  })

  it('every catalog id is unique and stable (no accidental duplicates)', () => {
    const ids = ECOSYSTEM_CATALOG.items.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Network sweep — opt-in via RUN_CATALOG_NETWORK=1 so CI stays offline and
  // deterministic. This is the check that catches the stale-name 404s the
  // user hit (e.g. @steve228uk/metro-mcp before the catalog was corrected).
  const runNetwork = process.env.RUN_CATALOG_NETWORK === '1'
  ;(runNetwork ? it : it.skip)('every MCP packageName resolves on the npm registry (RUN_CATALOG_NETWORK=1)', async () => {
    const mcps = listEcosystemItems({ category: 'mcp' })
    const missing: string[] = []
    for (const item of mcps) {
      const check = await checkPackageOnRegistry(item.packageName!)
      if (check.verified && !check.exists) missing.push(`${item.id} → ${item.packageName}`)
    }
    expect(missing).toEqual([])
  }, 60_000)
})
