import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { KnowledgeRefreshService } from '../../src/knowledge/refresh/KnowledgeRefreshService'
import { StubWebFetcher } from '../../src/knowledge/refresh/fetchers'
import { versionDiffForTests } from '../../src/knowledge/refresh/KnowledgeRefreshService'
import type { WebFetcher } from '../../src/knowledge/refresh/types'

describe('KnowledgeRefreshService', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vectalon-refresh-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('caches fetched documents and returns them on stale refresh', async () => {
    const fetcher = new StubWebFetcher({
      'https://reactnative.dev/docs/getting-started': '<html>RN docs</html>',
    })
    const service = new KnowledgeRefreshService({
      projectRoot: tmpDir,
      fetcher,
      sources: [
        {
          id: 'react-native-docs',
          name: 'React Native Docs',
          description: '...',
          urls: ['https://reactnative.dev/docs/getting-started'],
          refreshIntervalMs: 7 * 24 * 60 * 60 * 1000,
          type: 'docs',
        },
      ],
    })

    const result = await service.refresh({ projectRoot: tmpDir, force: true })

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].content).toBe('<html>RN docs</html>')
    expect(result.errors).toHaveLength(0)

    const cachePath = join(tmpDir, '.vectalon', 'knowledge', 'refresh', 'cache.json')
    expect(existsSync(cachePath)).toBe(true)
  })

  it('generates improvement suggestions for outdated dependencies', async () => {
    const fetcher = new StubWebFetcher({
      'https://registry.npmjs.org/react-native/latest': JSON.stringify({ version: '0.73.0' }),
    })
    const service = new KnowledgeRefreshService({
      projectRoot: tmpDir,
      fetcher,
      sources: [],
    })

    const result = await service.refresh({
      projectRoot: tmpDir,
      dependencies: { 'react-native': '^0.72.0' },
      force: true,
    })

    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].library).toBe('react-native')
    expect(result.suggestions[0].currentVersion).toBe('^0.72.0')
    expect(result.suggestions[0].latestVersion).toBe('0.73.0')
    expect(result.suggestions[0].severity).toBe('warning')
  })

  it('falls back to cached documents when fetch fails', async () => {
    const fetcher = new StubWebFetcher({
      'https://reactnative.dev/docs/getting-started': 'first fetch',
    })
    const service = new KnowledgeRefreshService({
      projectRoot: tmpDir,
      fetcher,
      sources: [
        {
          id: 'react-native-docs',
          name: 'React Native Docs',
          description: '...',
          urls: ['https://reactnative.dev/docs/getting-started'],
          refreshIntervalMs: 1000,
          type: 'docs',
        },
      ],
    })

    await service.refresh({ projectRoot: tmpDir, force: true })
    fetcher.removeResponse('https://reactnative.dev/docs/getting-started')
    const result = await service.refresh({ projectRoot: tmpDir, force: true })

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].content).toBe('first fetch')
  })

  it('returns stale when cache is empty or older than interval', async () => {
    const service = new KnowledgeRefreshService({
      projectRoot: tmpDir,
      sources: [{ id: 'x', name: 'X', description: '...', urls: [], refreshIntervalMs: 1000, type: 'docs' }],
    })

    expect(service.isStale()).toBe(true)
  })

  it('serializes concurrent refreshes into a single fetch run', async () => {
    let fetchCount = 0
    const fetcher: WebFetcher = {
      async fetch() {
        fetchCount++
        await new Promise(resolve => setTimeout(resolve, 10))
        return JSON.stringify({ version: '1.2.0' })
      },
    }
    const service = new KnowledgeRefreshService({ projectRoot: tmpDir, fetcher, sources: [] })

    const results = await Promise.all([
      service.refresh({ projectRoot: tmpDir, dependencies: { 'react-native': '1.0.0' }, force: true }),
      service.refresh({ projectRoot: tmpDir, dependencies: { 'react-native': '1.0.0' }, force: true }),
    ])

    expect(fetchCount).toBe(1)
    expect(results[0]).toBe(results[1])
  })

  it('fetches each URL of a multi-URL source exactly once', async () => {
    const urls = ['https://example.com/a', 'https://example.com/b']
    let fetchCount = 0
    const fetcher: WebFetcher = {
      async fetch() {
        fetchCount++
        return '<html>doc</html>'
      },
    }
    const service = new KnowledgeRefreshService({
      projectRoot: tmpDir,
      fetcher,
      sources: [
        { id: 'multi', name: 'Multi URL', description: '...', urls, refreshIntervalMs: 1000, type: 'docs' },
      ],
    })

    const result = await service.refresh({ projectRoot: tmpDir, force: true })

    expect(fetchCount).toBe(2)
    expect(result.documents).toHaveLength(2)
  })

  it('calculates version differences', () => {
    // 0.x: minor bumps count as the meaningful step
    expect(versionDiffForTests('^0.72.0', '0.73.0')).toBe(1)
    // 0.x: patch-only bumps are not flagged
    expect(versionDiffForTests('0.72.0', '0.72.5')).toBe(0)
    // stable: major bumps count fully
    expect(versionDiffForTests('1.0.0', '3.0.0')).toBe(2)
    // stable, same major: minor bumps are flagged (bug/security fixes)
    expect(versionDiffForTests('~2.1.0', '2.5.0')).toBe(1)
    // stable, same major: patch-only bumps are not flagged
    expect(versionDiffForTests('2.5.0', '2.5.3')).toBe(0)
    // downgrades are never flagged
    expect(versionDiffForTests('2.5.0', '2.4.0')).toBe(0)
  })
})
