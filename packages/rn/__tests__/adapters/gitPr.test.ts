import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { LocalGitAdapter, parseGithubRemote } from '../../src/adapters/git'
import { runCommand } from '../../src/adapters/runCommand'
import { createTempProject, cleanup } from '../helpers/tmp'

jest.mock('../../src/adapters/runCommand', () => ({
  runCommand: jest.fn(),
}))

const runCommandMock = runCommand as jest.Mock

describe('parseGithubRemote', () => {
  it('parses SSH and HTTPS GitHub remotes', () => {
    expect(parseGithubRemote('git@github.com:acme/app.git')).toEqual({ owner: 'acme', repo: 'app' })
    expect(parseGithubRemote('https://github.com/acme/app.git')).toEqual({ owner: 'acme', repo: 'app' })
    expect(parseGithubRemote('https://github.com/acme/app')).toEqual({ owner: 'acme', repo: 'app' })
    expect(parseGithubRemote('ssh://git@github.com/acme/app.git')).toEqual({ owner: 'acme', repo: 'app' })
  })

  it('returns null for non-GitHub remotes', () => {
    expect(parseGithubRemote('git@gitlab.com:acme/app.git')).toBeNull()
    expect(parseGithubRemote('')).toBeNull()
  })
})

describe('LocalGitAdapter pull requests', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.git'), { recursive: true })
    runCommandMock.mockReset()
    // Default: gh CLI is unavailable and no remote configured.
    runCommandMock.mockImplementation(async () => {
      throw new Error('not a git repo')
    })
  })

  afterEach(() => {
    cleanup(dir)
    delete process.env.GITHUB_TOKEN
  })

  const input = {
    title: 'feat: add login',
    body: '## What changed\n\n- src/Login.tsx',
    head: 'feature/login',
    base: 'main',
  }

  function withGithubRemote(): void {
    writeFileSync(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:acme/app.git\n')
    runCommandMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'git' ) return { success: true, stdout: 'git@github.com:acme/app.git', stderr: '', exitCode: 0 }
      throw new Error('unknown command')
    })
  }

  it('skips PR creation when push is not allowed', async () => {
    const pr = await new LocalGitAdapter(dir, false).createPullRequest(input)
    expect(pr).toBeNull()
  })

  it('returns null when there is no GitHub remote', async () => {
    const pr = await new LocalGitAdapter(dir, true).createPullRequest(input)
    expect(pr).toBeNull()
  })

  it('creates a PR via the GitHub REST API when GITHUB_TOKEN is set', async () => {
    withGithubRemote()
    process.env.GITHUB_TOKEN = 'tok-123'

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: 42, number: 7, html_url: 'https://github.com/acme/app/pull/7', title: 'feat: add login' }),
    })) as jest.Mock
    global.fetch = fetchMock as unknown as typeof fetch

    const pr = await new LocalGitAdapter(dir, true).createPullRequest(input)

    expect(pr).toEqual({ id: '42', number: 7, url: 'https://github.com/acme/app/pull/7', title: 'feat: add login' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/acme/app/pulls')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ title: 'feat: add login', head: 'feature/login', base: 'main' })
  })

  it('returns null when the GitHub API rejects the PR', async () => {
    withGithubRemote()
    process.env.GITHUB_TOKEN = 'tok-123'

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Validation Failed' }),
    })) as unknown as typeof fetch

    const pr = await new LocalGitAdapter(dir, true).createPullRequest(input)
    expect(pr).toBeNull()
  })

  it('falls back to the gh CLI when no token is set', async () => {
    writeFileSync(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:acme/app.git\n')

    runCommandMock.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'git') return { success: true, stdout: 'git@github.com:acme/app.git', stderr: '', exitCode: 0 }
      if (cmd === 'gh' && args[0] === '--version') return { success: true, stdout: 'gh version 2.0.0', stderr: '', exitCode: 0 }
      if (cmd === 'gh' && args[0] === 'pr') {
        return { success: true, stdout: JSON.stringify({ id: '99', number: 3, url: 'https://github.com/acme/app/pull/3', title: 'feat: add login' }), stderr: '', exitCode: 0 }
      }
      return { success: true, stdout: '', stderr: '', exitCode: 0 }
    })

    const pr = await new LocalGitAdapter(dir, true).createPullRequest(input)
    expect(pr).toEqual({ id: '99', number: 3, url: 'https://github.com/acme/app/pull/3', title: 'feat: add login' })
    expect(runCommandMock).toHaveBeenCalledWith('gh', expect.arrayContaining(['pr', 'create', '--repo', 'acme/app']), expect.anything())
  })

  it('posts a review comment via the REST API', async () => {
    withGithubRemote()
    process.env.GITHUB_TOKEN = 'tok-123'

    const fetchMock = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({}) })) as jest.Mock
    global.fetch = fetchMock as unknown as typeof fetch

    await new LocalGitAdapter(dir, true).commentPullRequest(7, '## Code review\n\nAll good')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/acme/app/issues/7/comments')
    expect(JSON.parse(String(init.body)).body).toContain('Code review')
  })
})
