import {
  repoFromNpmUrl,
  fetchPackageSignals,
  readSignalsCache,
  writeSignalsCache,
  collectBundleSignals,
  isSwapCandidate,
  alternativeFor,
} from '../../src/utils/npmSignals'
import { createTempProject, cleanup } from '../helpers/tmp'

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('repoFromNpmUrl', () => {
  it('parses git+ and plain github URLs', () => {
    expect(repoFromNpmUrl('git+https://github.com/facebook/react-native.git')).toEqual({ owner: 'facebook', repo: 'react-native' })
    expect(repoFromNpmUrl('https://github.com/acme/foo')).toEqual({ owner: 'acme', repo: 'foo' })
    expect(repoFromNpmUrl('https://gitlab.com/acme/foo')).toBeNull()
    expect(repoFromNpmUrl(undefined)).toBeNull()
  })
})

describe('fetchPackageSignals', () => {
  const fetchMock = jest.fn(async (url: string) => {
    if (url.includes('registry.npmjs.org')) {
      return jsonResponse({
        'dist-tags': { latest: '2.0.0' },
        time: { modified: '2026-01-01T00:00:00Z' },
        repository: { url: 'git+https://github.com/acme/foo.git' },
        license: 'MIT',
      })
    }
    if (url.includes('api.npmjs.org')) return jsonResponse({ downloads: 12345 })
    if (url.includes('api.github.com')) return jsonResponse({ stargazers_count: 999 })
    throw new Error(`unexpected url ${url}`)
  })

  beforeEach(() => {
    fetchMock.mockClear()
    ;(global as { fetch: unknown }).fetch = fetchMock
  })

  it('collects version, last publish, downloads, license and stars', async () => {
    const signals = await fetchPackageSignals('foo')
    expect(signals.version).toBe('2.0.0')
    expect(signals.lastPublish).toBe('2026-01-01T00:00:00Z')
    expect(signals.weeklyDownloads).toBe(12345)
    expect(signals.githubStars).toBe(999)
    expect(signals.license).toBe('MIT')
    expect(signals.npmUrl).toBe('https://www.npmjs.com/package/foo')
    expect(signals.githubUrl).toBe('https://github.com/acme/foo')
    // registry + downloads + github stars
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('encodes scoped package names', async () => {
    await fetchPackageSignals('@sentry/react-native')
    const urls = fetchMock.mock.calls.map(c => c[0] as string)
    expect(urls.some(u => u.includes('registry.npmjs.org/@sentry%2Freact-native'))).toBe(true)
  })

  it('skips the GitHub call when stars are gated', async () => {
    await fetchPackageSignals('foo', { allowStars: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some(c => (c[0] as string).includes('api.github.com'))).toBe(false)
  })

  it('never throws when the registry is unreachable', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down')
    })
    const signals = await fetchPackageSignals('foo')
    expect(signals.version).toBeUndefined()
    expect(signals.weeklyDownloads).toBeUndefined()
    expect(signals.npmUrl).toBe('https://www.npmjs.com/package/foo')
  })

  it('handles a non-GitHub repository', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('registry.npmjs.org')) {
        return jsonResponse({ repository: 'https://gitlab.com/acme/foo' })
      }
      if (url.includes('api.npmjs.org')) return jsonResponse({ downloads: 5 })
      throw new Error('github should not be called')
    })
    const signals = await fetchPackageSignals('foo')
    expect(signals.githubStars).toBeUndefined()
    expect(signals.githubUrl).toBeUndefined()
    expect(signals.weeklyDownloads).toBe(5)
  })
})

describe('signals cache', () => {
  let dir: string
  let fetchMock: jest.Mock

  beforeEach(() => {
    dir = createTempProject({})
    fetchMock = jest.fn(async () => jsonResponse({}))
    ;(global as { fetch: unknown }).fetch = fetchMock
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('round-trips through .vectalon/bundle/signals.json', () => {
    writeSignalsCache(dir, { foo: { npmUrl: 'https://www.npmjs.com/package/foo', fetchedAt: 123 } })
    expect(readSignalsCache(dir)).toEqual({ foo: { npmUrl: 'https://www.npmjs.com/package/foo', fetchedAt: 123 } })
  })

  it('uses fresh cache entries without fetching', async () => {
    writeSignalsCache(dir, {
      foo: { npmUrl: 'https://www.npmjs.com/package/foo', version: '1.0.0', fetchedAt: Date.now() },
    })
    const signals = await collectBundleSignals(dir, ['foo'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(signals.foo.version).toBe('1.0.0')
  })

  it('reserves the GitHub rate-limit budget across parallel fetches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('registry.npmjs.org')) return jsonResponse({ repository: 'https://github.com/acme/x' })
      if (url.includes('api.npmjs.org')) return jsonResponse({ downloads: 1 })
      if (url.includes('api.github.com')) return jsonResponse({ stargazers_count: 5 })
      throw new Error('unexpected')
    })
    await collectBundleSignals(dir, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], { maxAgeMs: 0 })
    const githubCalls = fetchMock.mock.calls.filter(c => (c[0] as string).includes('api.github.com'))
    expect(githubCalls).toHaveLength(6)
  })

  it('fetches missing entries and persists them', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('registry.npmjs.org')) return jsonResponse({ 'dist-tags': { latest: '3.0.0' } })
      if (url.includes('api.npmjs.org')) return jsonResponse({ downloads: 42 })
      throw new Error('unexpected')
    })
    const signals = await collectBundleSignals(dir, ['bar'], { fetchLimit: 5 })
    expect(signals.bar.version).toBe('3.0.0')
    expect(signals.bar.weeklyDownloads).toBe(42)
    expect(readSignalsCache(dir).bar).toBeDefined()
    expect(readSignalsCache(dir).bar.fetchedAt).toBeGreaterThan(0)
  })
})

describe('known alternatives', () => {
  it('flags heavy deps with curated swaps', () => {
    expect(isSwapCandidate('moment')).toBe(true)
    expect(isSwapCandidate('lodash')).toBe(true)
    expect(isSwapCandidate('react-native-svg')).toBe(false)
    expect(alternativeFor('moment')?.to).toBe('dayjs')
    expect(alternativeFor('nope')).toBeUndefined()
  })
})
