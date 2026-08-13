import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import {
  LocalGitAdapter,
  parseGithubRemote,
  parseAzureRemote,
  parseGitlabRemote,
  parseBitbucketRemote,
  detectRemoteProvider,
  remoteUrlFromEnv,
} from '../../src/adapters/git'

function makeRepo(remote = 'git@github.com:acme/app.git'): string {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-git-'))
  execSync('git init -q', { cwd: dir })
  execSync(`git remote add origin ${remote}`, { cwd: dir })
  return dir
}

const MARKER = 'vectalon-visual-ci'
const BODY = '### Visual regression\n<!-- ' + MARKER + ' -->\n| login-screen | pass |'

describe('remote parsers', () => {
  it('parses GitHub remotes (SSH + HTTPS)', () => {
    expect(parseGithubRemote('git@github.com:acme/app.git')).toEqual({ owner: 'acme', repo: 'app' })
    expect(parseGithubRemote('https://github.com/acme/app.git')).toEqual({ owner: 'acme', repo: 'app' })
    expect(parseGithubRemote('ssh.dev.azure.com:v3/org/proj/repo')).toBeNull()
  })

  it('parses Azure DevOps remotes (HTTPS + SSH)', () => {
    expect(parseAzureRemote('https://dev.azure.com/getgenea/OTHVAC-Mobile/_git/OTHVAC-Mobile')).toEqual({
      org: 'getgenea',
      project: 'OTHVAC-Mobile',
      repo: 'OTHVAC-Mobile',
    })
    expect(parseAzureRemote('ssh.dev.azure.com:v3/getgenea/OTHVAC-Mobile/OTHVAC-Mobile')).toEqual({
      org: 'getgenea',
      project: 'OTHVAC-Mobile',
      repo: 'OTHVAC-Mobile',
    })
    expect(parseAzureRemote('git@github.com:acme/app.git')).toBeNull()
  })

  it('parses GitLab remotes (nested groups)', () => {
    expect(parseGitlabRemote('git@gitlab.com:group/sub/app.git')).toEqual({ namespace: 'group/sub', repo: 'app' })
    expect(parseGitlabRemote('https://gitlab.com/group/app.git')).toEqual({ namespace: 'group', repo: 'app' })
  })

  it('parses Bitbucket remotes', () => {
    expect(parseBitbucketRemote('git@bitbucket.org:acme/app.git')).toEqual({ workspace: 'acme', repo: 'app' })
    expect(parseBitbucketRemote('https://bitbucket.org/acme/app.git')).toEqual({ workspace: 'acme', repo: 'app' })
  })

  it('detects the provider from any remote URL', () => {
    expect(detectRemoteProvider('ssh.dev.azure.com:v3/org/proj/repo')).toBe('azure')
    expect(detectRemoteProvider('git@gitlab.com:group/app.git')).toBe('gitlab')
    expect(detectRemoteProvider('git@bitbucket.org:acme/app.git')).toBe('bitbucket')
    expect(detectRemoteProvider('git@github.com:acme/app.git')).toBe('github')
    expect(detectRemoteProvider('git@example.com:acme/app.git')).toBeNull()
  })
})

describe('remoteUrlFromEnv', () => {
  const keys = ['GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITLAB_CI', 'CI_PROJECT_PATH', 'BITBUCKET_PIPELINES', 'BITBUCKET_REPO_FULL_NAME', 'SYSTEM_TEAMPROJECT', 'BUILD_REPOSITORY_URI']
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('derives the remote from each provider env pair', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_REPOSITORY = 'acme/app'
    expect(remoteUrlFromEnv()).toBe('https://github.com/acme/app.git')
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITHUB_REPOSITORY

    process.env.GITLAB_CI = 'true'
    process.env.CI_PROJECT_PATH = 'group/sub/app'
    expect(remoteUrlFromEnv()).toBe('https://gitlab.com/group/sub/app.git')
    delete process.env.GITLAB_CI
    delete process.env.CI_PROJECT_PATH

    process.env.BITBUCKET_PIPELINES = 'true'
    process.env.BITBUCKET_REPO_FULL_NAME = 'acme/app'
    expect(remoteUrlFromEnv()).toBe('https://bitbucket.org/acme/app.git')
    delete process.env.BITBUCKET_PIPELINES
    delete process.env.BITBUCKET_REPO_FULL_NAME

    process.env.SYSTEM_TEAMPROJECT = 'OTHVAC-Mobile'
    process.env.BUILD_REPOSITORY_URI = 'https://dev.azure.com/getgenea/OTHVAC-Mobile/_git/OTHVAC-Mobile'
    expect(remoteUrlFromEnv()).toBe('https://dev.azure.com/getgenea/OTHVAC-Mobile/_git/OTHVAC-Mobile')
  })

  it('returns null with no provider env', () => {
    expect(remoteUrlFromEnv()).toBeNull()
  })
})

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

describe('LocalGitAdapter.upsertPullRequestComment — Azure DevOps', () => {
  let dir: string
  let originalFetch: typeof fetch
  let originalToken: string | undefined

  beforeEach(() => {
    dir = makeRepo('ssh.dev.azure.com:v3/getgenea/OTHVAC-Mobile/OTHVAC-Mobile')
    originalFetch = global.fetch
    originalToken = process.env.AZURE_DEVOPS_TOKEN
    process.env.AZURE_DEVOPS_TOKEN = 'pat-token'
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    global.fetch = originalFetch
    if (originalToken === undefined) delete process.env.AZURE_DEVOPS_TOKEN
    else process.env.AZURE_DEVOPS_TOKEN = originalToken
  })

  it('PATCHes the existing thread comment carrying the marker', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 99, comments: [{ id: 7, content: 'old <!-- ' + MARKER + ' -->' }] }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(42, MARKER, BODY)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/pullRequests/42/threads')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/threads/99/comments/7')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' })
    expect(String(fetchMock.mock.calls[0][1]?.headers?.Authorization)).toMatch(/^Basic /)
  })

  it('POSTs a new thread when none carries the marker', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(42, MARKER, BODY)

    expect(String(fetchMock.mock.calls[1][0])).toContain('/pullRequests/42/threads')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body).comments[0].content).toContain(MARKER)
  })

  it('skips with a warning when AZURE_DEVOPS_TOKEN is missing', async () => {
    delete process.env.AZURE_DEVOPS_TOKEN
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    await adapter.upsertPullRequestComment(42, MARKER, BODY)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('LocalGitAdapter.upsertPullRequestComment — GitLab', () => {
  let dir: string
  let originalFetch: typeof fetch
  let originalToken: string | undefined

  beforeEach(() => {
    dir = makeRepo('git@gitlab.com:getgenea/otvac-mobile.git')
    originalFetch = global.fetch
    originalToken = process.env.GITLAB_TOKEN
    process.env.GITLAB_TOKEN = 'gl-token'
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    global.fetch = originalFetch
    if (originalToken === undefined) delete process.env.GITLAB_TOKEN
    else process.env.GITLAB_TOKEN = originalToken
  })

  it('PUTs the existing note carrying the marker', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 11, body: 'old <!-- ' + MARKER + ' -->' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(7, MARKER, BODY)

    expect(String(fetchMock.mock.calls[0][0])).toContain('/projects/getgenea%2Fotvac-mobile/merge_requests/7/notes')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/notes/11')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[0][1]?.headers?.['PRIVATE-TOKEN']).toBe('gl-token')
  })

  it('POSTs a new note when none carries the marker', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(7, MARKER, BODY)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body).body).toContain(MARKER)
  })
})

describe('LocalGitAdapter.upsertPullRequestComment — Bitbucket', () => {
  let dir: string
  let originalFetch: typeof fetch
  let originalUser: string | undefined
  let originalPass: string | undefined

  beforeEach(() => {
    dir = makeRepo('git@bitbucket.org:getgenea/otvac-mobile.git')
    originalFetch = global.fetch
    originalUser = process.env.BITBUCKET_USERNAME
    originalPass = process.env.BITBUCKET_APP_PASSWORD
    process.env.BITBUCKET_USERNAME = 'bot'
    process.env.BITBUCKET_APP_PASSWORD = 'app-pass'
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    global.fetch = originalFetch
    if (originalUser === undefined) delete process.env.BITBUCKET_USERNAME
    else process.env.BITBUCKET_USERNAME = originalUser
    if (originalPass === undefined) delete process.env.BITBUCKET_APP_PASSWORD
    else process.env.BITBUCKET_APP_PASSWORD = originalPass
  })

  it('PUTs the existing comment carrying the marker', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ values: [{ id: 5, content: { raw: 'old <!-- ' + MARKER + ' -->' } }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(9, MARKER, BODY)

    expect(String(fetchMock.mock.calls[0][0])).toContain('/repositories/getgenea/otvac-mobile/pullrequests/9/comments')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/comments/5')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' })
    expect(String(fetchMock.mock.calls[0][1]?.headers?.Authorization)).toMatch(/^Basic /)
  })

  it('POSTs a new comment when none carries the marker', async () => {
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ values: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(9, MARKER, BODY)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body).content.raw).toContain(MARKER)
  })
})

describe('LocalGitAdapter.upsertPullRequestComment — provider dispatch', () => {
  let dir: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    global.fetch = originalFetch
  })

  it('routes to the provider detected from the origin remote', async () => {
    dir = makeRepo('git@gitlab.com:acme/app.git')
    process.env.GITLAB_TOKEN = 'gl-token'
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(3, MARKER, BODY)
    expect(String(fetchMock.mock.calls[0][0])).toContain('gitlab.com/api/v4')
    delete process.env.GITLAB_TOKEN
  })

  it('warns and skips for an unrecognized host', async () => {
    dir = makeRepo('git@example.com:acme/app.git')
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    await adapter.upsertPullRequestComment(3, MARKER, BODY)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('LocalGitAdapter.upsertPullRequestComment — env-derived remote (remote-less CI checkout)', () => {
  let dir: string
  let originalFetch: typeof fetch
  const saved: Record<string, string | undefined> = {}
  // Scrub every provider's env, including GitHub Actions' own ambient vars
  // (GITHUB_ACTIONS / GITHUB_REPOSITORY / GITHUB_TOKEN / GH_TOKEN) and the
  // generic CI flag — these tests simulate a remote-less Azure/GitLab checkout
  // and the adapter's remoteUrlFromEnv() checks GitHub first, so a leaked
  // GitHub env would route the adapter to GitHub (or the gh CLI) and never
  // reach the fetch mock. GH_TOKEN also disables gh's ambient auth lookup.
  const keys = ['SYSTEM_TEAMPROJECT', 'BUILD_REPOSITORY_URI', 'AZURE_DEVOPS_TOKEN', 'GITLAB_CI', 'CI_PROJECT_PATH', 'GITLAB_TOKEN', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'GH_TOKEN', 'CI', 'BITBUCKET_PIPELINES', 'BITBUCKET_REPO_FULL_NAME', 'BITBUCKET_USERNAME', 'BITBUCKET_APP_PASSWORD']

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    originalFetch = global.fetch
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    global.fetch = originalFetch
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('posts an Azure thread when the checkout has no origin remote but CI env is present', async () => {
    // Azure Pipelines checkouts have no origin remote.
    dir = mkdtempSync(join(tmpdir(), 'vectalon-git-'))
    execSync('git init -q', { cwd: dir })
    process.env.SYSTEM_TEAMPROJECT = 'OTHVAC-Mobile'
    process.env.BUILD_REPOSITORY_URI = 'https://dev.azure.com/getgenea/OTHVAC-Mobile/_git/OTHVAC-Mobile'
    process.env.AZURE_DEVOPS_TOKEN = 'pat-token'
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(42, MARKER, BODY)

    expect(String(fetchMock.mock.calls[0][0])).toContain('dev.azure.com/getgenea/OTHVAC-Mobile/_apis')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' })
  })

  it('posts a GitLab note when the checkout has no origin remote but CI env is present', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-git-'))
    execSync('git init -q', { cwd: dir })
    process.env.GITLAB_CI = 'true'
    process.env.CI_PROJECT_PATH = 'getgenea/otvac-mobile'
    process.env.GITLAB_TOKEN = 'gl-token'
    const adapter = new LocalGitAdapter(dir, true)
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await adapter.upsertPullRequestComment(7, MARKER, BODY)
    expect(String(fetchMock.mock.calls[0][0])).toContain('gitlab.com/api/v4/projects/getgenea%2Fotvac-mobile')
  })
})
