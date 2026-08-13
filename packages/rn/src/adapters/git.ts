import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, writeFileSync } from 'fs'
import { logger } from '../cli/logger'
import { reportError } from '../utils/safe'
import { runCommand } from './runCommand'
import type { GitAdapter, CommitInput, PullRequestInput, PullRequest } from './types'

const GITHUB_API = 'https://api.github.com'

/**
 * Extract `{ owner, repo }` from a git remote URL — supports SSH
 * (`git@github.com:acme/app.git`), HTTPS (`https://github.com/acme/app.git`),
 * and `ssh://` forms. Returns null for non-GitHub remotes.
 */
export function parseGithubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const trimmed = remoteUrl.trim()
  const match = trimmed.match(/(?:github\.com[:/])([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

/**
 * Extract `{ org, project, repo }` from an Azure DevOps remote — supports the
 * HTTPS form (`https://dev.azure.com/{org}/{project}/_git/{repo}`) and the
 * SSH form (`ssh.dev.azure.com:v3/{org}/{project}/{repo}`).
 */
export function parseAzureRemote(remoteUrl: string): { org: string; project: string; repo: string } | null {
  const trimmed = remoteUrl.trim()
  const https = trimmed.match(/dev\.azure\.com\/([^/\s]+)\/([^/\s]+)\/_git\/([^/\s]+?)(?:\.git)?\/?$/)
  if (https) return { org: https[1], project: https[2], repo: https[3].replace(/\.git$/, '') }
  const ssh = trimmed.match(/ssh\.dev\.azure\.com:v3\/([^/\s]+)\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  if (ssh) return { org: ssh[1], project: ssh[2], repo: ssh[3].replace(/\.git$/, '') }
  return null
}

/**
 * Extract `{ namespace, repo }` from a GitLab remote — supports SSH
 * (`git@gitlab.com:group/sub/repo.git`) and HTTPS (`https://gitlab.com/group/sub/repo.git`).
 */
export function parseGitlabRemote(remoteUrl: string): { namespace: string; repo: string } | null {
  const trimmed = remoteUrl.trim()
  const match = trimmed.match(/gitlab\.com[:/](.+?)\.git\/?$/)
  if (!match) return null
  const path = match[1]
  const slash = path.lastIndexOf('/')
  if (slash === -1) return null
  return { namespace: path.slice(0, slash), repo: path.slice(slash + 1) }
}

/**
 * Extract `{ workspace, repo }` from a Bitbucket remote — supports SSH
 * (`git@bitbucket.org:workspace/repo.git`) and HTTPS
 * (`https://bitbucket.org/workspace/repo.git`).
 */
export function parseBitbucketRemote(remoteUrl: string): { workspace: string; repo: string } | null {
  const trimmed = remoteUrl.trim()
  const match = trimmed.match(/bitbucket\.org[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  if (!match) return null
  return { workspace: match[1], repo: match[2].replace(/\.git$/, '') }
}

/** The CI/PR host a git remote points at, or null when unrecognized. */
export type RemoteProvider = 'github' | 'azure' | 'gitlab' | 'bitbucket'

export function detectRemoteProvider(remoteUrl: string): RemoteProvider | null {
  const trimmed = remoteUrl.trim()
  if (/github\.com/.test(trimmed)) return 'github'
  if (/dev\.azure\.com|ssh\.dev\.azure\.com/.test(trimmed)) return 'azure'
  if (/gitlab\.com/.test(trimmed)) return 'gitlab'
  if (/bitbucket\.org/.test(trimmed)) return 'bitbucket'
  return null
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'rn-vectalon',
  }
}

/** Azure DevOps PR threads API headers (PAT via Basic auth, empty username). */
function azureHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

/** GitLab API headers (PRIVATE-TOKEN / personal access token). */
function gitlabHeaders(token: string): Record<string, string> {
  return {
    'PRIVATE-TOKEN': token,
    'Content-Type': 'application/json',
  }
}

/** Bitbucket API headers (app password via Basic auth). */
function bitbucketHeaders(username: string, password: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

export class LocalGitAdapter implements GitAdapter {
  name = 'local'

  private ownerRepo: { owner: string; repo: string } | null | undefined
  private remoteUrl: string | null | undefined
  private ghAvailable: boolean | undefined

  constructor(
    private root: string,
    private allowPush: boolean = false
  ) {}

  async createBranch(name: string): Promise<void> {
    await runCommand('git', ['checkout', '-b', name], { cwd: this.root })
  }

  async commit(input: CommitInput): Promise<string> {
    const files = input.files && input.files.length > 0 ? input.files : ['.']
    await runCommand('git', ['add', ...files], { cwd: this.root })
    const args = input.allowEmpty
      ? ['commit', '--allow-empty', '-m', input.message]
      : ['commit', '-m', input.message]
    const result = await runCommand('git', args, { cwd: this.root })
    return result.stdout
  }

  async push(branch?: string): Promise<void> {
    if (!this.allowPush) {
      logger.warn(`Skipping git push (branch: ${branch || 'current'}). Use --push or config.git.push=true to push.`)
      return
    }
    const args = branch ? ['push', '-u', 'origin', branch] : ['push']
    await runCommand('git', args, { cwd: this.root })
  }

  /**
   * Open a real pull request. Strategy: GitHub REST API when `GITHUB_TOKEN` is
   * set, then the `gh` CLI when available, then a warning + null. Never returns
   * a fabricated PR.
   */
  async createPullRequest(input: PullRequestInput): Promise<PullRequest | null> {
    if (!this.allowPush) {
      logger.warn(`Skipping PR creation for "${input.title}". Use --push or config.git.push=true to open a PR.`)
      return null
    }
    const repo = await this.getOwnerRepo()
    if (!repo) return null

    const token = process.env.GITHUB_TOKEN
    if (token) {
      return this.createPullRequestViaApi(repo.owner, repo.repo, input, token)
    }
    if (await this.hasGhCli()) {
      return this.createPullRequestViaGh(repo.owner, repo.repo, input)
    }

    logger.warn('Set GITHUB_TOKEN or install the GitHub CLI (`gh`) to open pull requests automatically.')
    return null
  }

  /** Post a comment (e.g. the code-review summary) on an open pull request. */
  async commentPullRequest(number: number, body: string): Promise<void> {
    if (!this.allowPush) {
      logger.warn(`Skipping PR comment (#${number}). Use --push or config.git.push=true to comment.`)
      return
    }
    const repo = await this.getOwnerRepo()
    if (!repo) {
      logger.warn(`PR comment skipped (#${number}): no GitHub remote found for origin.`)
      return
    }
    await this.postComment(repo.owner, repo.repo, number, body)
  }

  /**
   * Post or update a PR comment by unique marker, so repeated runs (visual
   * CI on every push) upsert one comment instead of spamming the thread.
   * Provider-native: GitHub (issues/comments PATCH or `gh` CLI), Azure DevOps
   * (PR threads PATCH), GitLab (MR note PUT), Bitbucket (PR comment PUT). Each
   * provider's token comes from its own env var (`GITHUB_TOKEN`,
   * `AZURE_DEVOPS_TOKEN`, `GITLAB_TOKEN`, `BITBUCKET_USERNAME` +
   * `BITBUCKET_APP_PASSWORD`).
   */
  async upsertPullRequestComment(number: number, marker: string, body: string): Promise<void> {
    if (!this.allowPush) {
      logger.warn(`Skipping PR comment (#${number}). Use --push or config.git.push=true to comment.`)
      return
    }
    const remote = await this.getRemoteUrl()
    if (!remote) {
      logger.warn(`PR comment skipped (#${number}): no origin remote found.`)
      return
    }
    const provider = detectRemoteProvider(remote)
    switch (provider) {
      case 'azure':
        await this.upsertAzureComment(remote, number, marker, body)
        return
      case 'gitlab':
        await this.upsertGitlabComment(remote, number, marker, body)
        return
      case 'bitbucket':
        await this.upsertBitbucketComment(remote, number, marker, body)
        return
      case 'github':
        await this.upsertGithubComment(remote, number, marker, body)
        return
      default:
        logger.warn(`PR comment skipped (#${number}): no supported PR host in the origin remote (${remote}).`)
    }
  }

  /** GitHub: edit the existing marker comment (issues/comments PATCH) or post a fresh one. */
  private async upsertGithubComment(remote: string, number: number, marker: string, body: string): Promise<void> {
    const repo = parseGithubRemote(remote)
    if (!repo) {
      logger.warn(`PR comment skipped (#${number}): could not parse GitHub remote (${remote}).`)
      return
    }

    const token = process.env.GITHUB_TOKEN
    if (token) {
      try {
        // Find the existing comment carrying the marker, then edit it in place.
        const listRes = await fetch(
          `${GITHUB_API}/repos/${repo.owner}/${repo.repo}/issues/${number}/comments?per_page=100`,
          { headers: ghHeaders(token) }
        )
        if (listRes.ok) {
          const comments = (await listRes.json()) as Array<{ id: number; body?: string }>
          const existing = comments.find(c => c.body?.includes(marker))
          if (existing) {
            const editRes = await fetch(
              `${GITHUB_API}/repos/${repo.owner}/${repo.repo}/issues/comments/${existing.id}`,
              { method: 'PATCH', headers: ghHeaders(token), body: JSON.stringify({ body }) }
            )
            if (!editRes.ok) {
              const data = (await editRes.json()) as { message?: string }
              logger.warn(`GitHub API comment edit failed (#${number}): ${data.message || editRes.status}`)
            }
            return
          }
        }
      } catch (err) {
        logger.warn(`GitHub API comment upsert failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
      }
      // No existing comment (or listing failed) — create one.
      await this.postComment(repo.owner, repo.repo, number, body)
      return
    }

    if (await this.hasGhCli()) {
      const bodyFile = this.writeTempBody(body)
      try {
        await runCommand('gh', ['pr', 'comment', String(number), '--repo', `${repo.owner}/${repo.repo}`, '--body-file', bodyFile], { cwd: this.root })
      } catch (err) {
        logger.warn(`gh pr comment failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        rmSync(bodyFile, { force: true })
      }
    }
  }

  /**
   * Azure DevOps: PR threads API. Threads carry comments; we find the thread
   * whose first comment holds the marker, PATCH the comment in place, else
   * POST a new thread with the marker comment.
   */
  private async upsertAzureComment(remote: string, number: number, marker: string, body: string): Promise<void> {
    const parsed = parseAzureRemote(remote)
    const token = process.env.AZURE_DEVOPS_TOKEN
    if (!parsed) {
      logger.warn(`PR comment skipped (#${number}): could not parse Azure remote (${remote}).`)
      return
    }
    if (!token) {
      logger.warn(`PR comment skipped (#${number}): set AZURE_DEVOPS_TOKEN (PAT) to comment on Azure DevOps PRs.`)
      return
    }
    const base = `https://dev.azure.com/${parsed.org}/${parsed.project}/_apis/git/repositories/${parsed.repo}/pullRequests/${number}/threads?api-version=7.1`
    try {
      const listRes = await fetch(base, { headers: azureHeaders(token) })
      if (listRes.ok) {
        const data = (await listRes.json()) as {
          value?: Array<{ id: number; comments?: Array<{ id: number; content?: string }> }>
        }
        const existing = data.value?.find(t => t.comments?.some(c => c.content?.includes(marker)))
        if (existing && existing.comments && existing.comments.length > 0) {
          const commentId = existing.comments[0].id
          const editRes = await fetch(
            `https://dev.azure.com/${parsed.org}/${parsed.project}/_apis/git/repositories/${parsed.repo}/pullRequests/${number}/threads/${existing.id}/comments/${commentId}?api-version=7.1`,
            { method: 'PATCH', headers: azureHeaders(token), body: JSON.stringify({ content: body }) }
          )
          if (!editRes.ok) {
            logger.warn(`Azure comment edit failed (#${number}): ${editRes.status}`)
          }
          return
        }
      }
    } catch (err) {
      logger.warn(`Azure comment upsert failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
    }
    // No thread carrying the marker — create one with the comment.
    try {
      const createRes = await fetch(base, {
        method: 'POST',
        headers: azureHeaders(token),
        body: JSON.stringify({ comments: [{ content: body, commentType: 1 }] }),
      })
      if (!createRes.ok) {
        logger.warn(`Azure comment create failed (#${number}): ${createRes.status}`)
      }
    } catch (err) {
      logger.warn(`Azure comment create failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** GitLab: merge-request notes API. Find the marker note and PUT, else POST. */
  private async upsertGitlabComment(remote: string, number: number, marker: string, body: string): Promise<void> {
    const parsed = parseGitlabRemote(remote)
    const token = process.env.GITLAB_TOKEN
    if (!parsed) {
      logger.warn(`PR comment skipped (#${number}): could not parse GitLab remote (${remote}).`)
      return
    }
    if (!token) {
      logger.warn(`PR comment skipped (#${number}): set GITLAB_TOKEN to comment on GitLab merge requests.`)
      return
    }
    const project = encodeURIComponent(`${parsed.namespace}/${parsed.repo}`)
    const base = `https://gitlab.com/api/v4/projects/${project}/merge_requests/${number}/notes`
    try {
      const listRes = await fetch(`${base}?per_page=100`, { headers: gitlabHeaders(token) })
      if (listRes.ok) {
        const notes = (await listRes.json()) as Array<{ id: number; body?: string }>
        const existing = notes.find(n => n.body?.includes(marker))
        if (existing) {
          const editRes = await fetch(`${base}/${existing.id}`, {
            method: 'PUT',
            headers: gitlabHeaders(token),
            body: JSON.stringify({ body }),
          })
          if (!editRes.ok) {
            logger.warn(`GitLab note edit failed (#${number}): ${editRes.status}`)
          }
          return
        }
      }
    } catch (err) {
      logger.warn(`GitLab note upsert failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      const createRes = await fetch(base, {
        method: 'POST',
        headers: gitlabHeaders(token),
        body: JSON.stringify({ body }),
      })
      if (!createRes.ok) {
        logger.warn(`GitLab note create failed (#${number}): ${createRes.status}`)
      }
    } catch (err) {
      logger.warn(`GitLab note create failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** Bitbucket: pull-request comments API. Find the marker comment and PUT, else POST. */
  private async upsertBitbucketComment(remote: string, number: number, marker: string, body: string): Promise<void> {
    const parsed = parseBitbucketRemote(remote)
    const username = process.env.BITBUCKET_USERNAME
    const password = process.env.BITBUCKET_APP_PASSWORD
    if (!parsed) {
      logger.warn(`PR comment skipped (#${number}): could not parse Bitbucket remote (${remote}).`)
      return
    }
    if (!username || !password) {
      logger.warn(`PR comment skipped (#${number}): set BITBUCKET_USERNAME + BITBUCKET_APP_PASSWORD to comment on Bitbucket PRs.`)
      return
    }
    const base = `https://api.bitbucket.org/2.0/repositories/${parsed.workspace}/${parsed.repo}/pullrequests/${number}/comments`
    try {
      const listRes = await fetch(`${base}?pagelen=100`, { headers: bitbucketHeaders(username, password) })
      if (listRes.ok) {
        const data = (await listRes.json()) as { values?: Array<{ id: number; content?: { raw?: string } }> }
        const existing = data.values?.find(c => c.content?.raw?.includes(marker))
        if (existing) {
          const editRes = await fetch(`${base}/${existing.id}`, {
            method: 'PUT',
            headers: bitbucketHeaders(username, password),
            body: JSON.stringify({ content: { raw: body } }),
          })
          if (!editRes.ok) {
            logger.warn(`Bitbucket comment edit failed (#${number}): ${editRes.status}`)
          }
          return
        }
      }
    } catch (err) {
      logger.warn(`Bitbucket comment upsert failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      const createRes = await fetch(base, {
        method: 'POST',
        headers: bitbucketHeaders(username, password),
        body: JSON.stringify({ content: { raw: body } }),
      })
      if (!createRes.ok) {
        logger.warn(`Bitbucket comment create failed (#${number}): ${createRes.status}`)
      }
    } catch (err) {
      logger.warn(`Bitbucket comment create failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** POST an issue comment via the GitHub API (token path). */
  private async postComment(owner: string, repo: string, number: number, body: string): Promise<void> {
    const token = process.env.GITHUB_TOKEN
    if (token) {
      try {
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments`, {
          method: 'POST',
          headers: ghHeaders(token),
          body: JSON.stringify({ body }),
        })
        if (!response.ok) {
          const data = (await response.json()) as { message?: string }
          logger.warn(`GitHub API comment failed (#${number}): ${data.message || response.status}`)
        }
      } catch (err) {
        logger.warn(`GitHub API comment failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
      }
      return
    }

    if (await this.hasGhCli()) {
      const bodyFile = this.writeTempBody(body)
      try {
        await runCommand('gh', ['pr', 'comment', String(number), '--repo', `${owner}/${repo}`, '--body-file', bodyFile], { cwd: this.root })
      } catch (err) {
        logger.warn(`gh pr comment failed (#${number}): ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        rmSync(bodyFile, { force: true })
      }
    }
  }

  private async createPullRequestViaApi(owner: string, repo: string, input: PullRequestInput, token: string): Promise<PullRequest | null> {
    try {
      const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.head,
          base: input.base || 'main',
          draft: input.draft ?? false,
        }),
      })
      const data = (await response.json()) as { id?: number; number?: number; html_url?: string; title?: string; message?: string }
      if (!response.ok || data.number === undefined) {
        logger.warn(`GitHub API PR creation failed: ${data.message || response.status}`)
        return null
      }
      logger.success(`Pull request opened: ${data.html_url}`)
      return { id: String(data.id), number: data.number, url: data.html_url || `https://github.com/${owner}/${repo}/pull/${data.number}`, title: data.title || input.title }
    } catch (err) {
      logger.warn(`GitHub API PR creation failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  private async createPullRequestViaGh(owner: string, repo: string, input: PullRequestInput): Promise<PullRequest | null> {
    const bodyFile = this.writeTempBody(input.body)
    try {
      const result = await runCommand('gh', ['pr', 'create', '--repo', `${owner}/${repo}`, '--title', input.title, '--body-file', bodyFile, '--head', input.head, '--base', input.base || 'main', '--json', 'id,number,url,title'], { cwd: this.root })
      const parsed = JSON.parse(result.stdout) as { id: string; number: number; url: string; title: string }
      logger.success(`Pull request opened: ${parsed.url}`)
      return { id: String(parsed.id), number: parsed.number, url: parsed.url, title: parsed.title }
    } catch (err) {
      logger.warn(`gh pr create failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    } finally {
      rmSync(bodyFile, { force: true })
    }
  }

  private writeTempBody(body: string): string {
    const bodyFile = join(tmpdir(), `vectalon-pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`)
    writeFileSync(bodyFile, body, 'utf-8')
    return bodyFile
  }

  private async getRemoteUrl(): Promise<string | null> {
    if (this.remoteUrl !== undefined) return this.remoteUrl
    try {
      const result = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd: this.root })
      this.remoteUrl = result.stdout.trim() || null
    } catch (err) {
      reportError(err, 'git: reading origin remote URL')
      this.remoteUrl = null
    }
    return this.remoteUrl
  }

  private async getOwnerRepo(): Promise<{ owner: string; repo: string } | null> {
    if (this.ownerRepo !== undefined) return this.ownerRepo
    const remote = await this.getRemoteUrl()
    this.ownerRepo = remote ? parseGithubRemote(remote) : null
    if (!this.ownerRepo) {
      logger.warn('No GitHub remote found for origin. Set one up or configure a GitHub remote to open PRs.')
    }
    return this.ownerRepo
  }

  private async hasGhCli(): Promise<boolean> {
    if (this.ghAvailable !== undefined) return this.ghAvailable
    try {
      await runCommand('gh', ['--version'], { cwd: this.root })
      this.ghAvailable = true
    } catch (err) {
      reportError(err, 'git: probing gh CLI availability')
      this.ghAvailable = false
    }
    return this.ghAvailable
  }
}

export class ConsoleGitAdapter implements GitAdapter {
  name = 'console'

  async createBranch(name: string): Promise<void> {
    logger.dim(`  Git: would create branch ${name}`)
  }

  async commit(input: CommitInput): Promise<string> {
    logger.dim(`  Git: would commit ${input.message}`)
    if (input.files && input.files.length > 0) {
      logger.dim(`    files: ${input.files.length}`)
    }
    return 'console-sha'
  }

  async push(branch?: string): Promise<void> {
    logger.dim(`  Git: would push${branch ? ` branch ${branch}` : ''}`)
  }

  async createPullRequest(input: PullRequestInput): Promise<PullRequest | null> {
    logger.dim(`  Git: would open PR "${input.title}" (${input.head} -> ${input.base || 'main'})`)
    return {
      id: 'console-pr-1',
      number: 1,
      url: 'https://example.com/pr/1',
      title: input.title,
    }
  }

  async commentPullRequest(number: number, body: string): Promise<void> {
    logger.dim(`  Git: would comment on PR #${number}`)
    logger.dim(`    ${body.split('\n')[0]}`)
  }

  async upsertPullRequestComment(number: number, marker: string, body: string): Promise<void> {
    logger.dim(`  Git: would upsert comment on PR #${number} (marker: ${marker})`)
    logger.dim(`    ${body.split('\n')[0]}`)
  }
}

export class GitHubAdapter implements GitAdapter {
  name = 'github'

  constructor(
    private owner: string,
    private repo: string,
    private token?: string
  ) {}

  async createBranch(name: string): Promise<void> {
    logger.info(`[GitHub] Would create branch ${name} in ${this.owner}/${this.repo}`)
  }

  async commit(input: CommitInput): Promise<string> {
    logger.info(`[GitHub] Would commit "${input.message}" to ${this.owner}/${this.repo}`)
    return 'github-sha'
  }

  async push(branch?: string): Promise<void> {
    logger.info(`[GitHub] Would push ${branch || 'current branch'} to origin`)
  }

  async createPullRequest(input: PullRequestInput): Promise<PullRequest | null> {
    const url = `https://github.com/${this.owner}/${this.repo}/pull/1`
    logger.info(`[GitHub] Would open PR: ${input.title}`)
    return {
      id: 'github-pr-1',
      number: 1,
      url,
      title: input.title,
    }
  }

  async commentPullRequest(number: number, body: string): Promise<void> {
    logger.info(`[GitHub] Would comment on PR #${number}: ${body.split('\n')[0]}`)
  }

  async upsertPullRequestComment(number: number, marker: string, body: string): Promise<void> {
    logger.info(`[GitHub] Would upsert comment on PR #${number} (marker: ${marker}): ${body.split('\n')[0]}`)
  }
}

export function createGitAdapter(config: Record<string, unknown> & { root?: string; dryRun?: boolean }): GitAdapter {
  const provider = (config.provider as string) || 'local'
  if (config.dryRun) {
    return new ConsoleGitAdapter()
  }
  if (provider === 'github') {
    return new GitHubAdapter(
      (config.owner as string) || '',
      (config.repo as string) || '',
      config.token as string | undefined
    )
  }
  return new LocalGitAdapter((config.root as string) || process.cwd(), config.push === true)
}
