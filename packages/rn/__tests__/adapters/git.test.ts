import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import { LocalGitAdapter } from '../../src/adapters/git'

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-git-'))
  execSync('git init -q', { cwd: dir })
  execSync('git remote add origin git@github.com:acme/app.git', { cwd: dir })
  return dir
}

const MARKER = 'vectalon-visual-ci'
const BODY = '### Visual regression\n<!-- ' + MARKER + ' -->\n| login-screen | pass |'

describe('LocalGitAdapter.upsertPullRequestComment', () => {
  let dir: string
  let originalToken: string | undefined
  let originalFetch: typeof fetch

  beforeEach(() => {
    dir = makeRepo()
    originalToken = process.env.GITHUB_TOKEN
    originalFetch = global.fetch
    process.env.GITHUB_TOKEN = 'test-token'
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = originalToken
    global.fetch = originalFetch
  })

  it('does nothing without push permission', async () => {
    const adapter = new LocalGitAdapter(dir, false)
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    await adapter.upsertPullRequestComment(7, MARKER, BODY)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('edits the existing comment carrying the marker (PATCH)', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 42, body: 'old <!-- ' + MARKER + ' -->' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(7, MARKER, BODY)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/issues/7/comments?per_page=100')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/issues/comments/42')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body).body).toContain(MARKER)
  })

  it('creates a fresh comment when no existing one carries the marker (POST)', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(7, MARKER, BODY)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/issues/7/comments')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  })

  it('creates a comment when the listing fails but the create succeeds', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'boom' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(7, MARKER, BODY)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  })

  it('degrades gracefully when there is no token and no gh CLI', async () => {
    delete process.env.GITHUB_TOKEN
    const adapter = new LocalGitAdapter(dir, true)
    await expect(adapter.upsertPullRequestComment(7, MARKER, BODY)).resolves.toBeUndefined()
  })

  it('a comment edit failure never throws', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 42, body: '<!-- ' + MARKER + ' -->' }] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'edit failed' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(adapter.upsertPullRequestComment(7, MARKER, BODY)).resolves.toBeUndefined()
  })
})
