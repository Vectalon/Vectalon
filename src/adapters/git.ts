import { tmpdir } from 'os'
import { join } from 'path'
import { rmSync, writeFileSync } from 'fs'
import { logger } from '../cli/logger'
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

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'rn-vectalon',
  }
}

export class LocalGitAdapter implements GitAdapter {
  name = 'local'

  private ownerRepo: { owner: string; repo: string } | null | undefined
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

    const token = process.env.GITHUB_TOKEN
    if (token) {
      try {
        const response = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}/issues/${number}/comments`, {
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
        await runCommand('gh', ['pr', 'comment', String(number), '--repo', `${repo.owner}/${repo.repo}`, '--body-file', bodyFile], { cwd: this.root })
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

  private async getOwnerRepo(): Promise<{ owner: string; repo: string } | null> {
    if (this.ownerRepo !== undefined) return this.ownerRepo
    try {
      const result = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd: this.root })
      this.ownerRepo = parseGithubRemote(result.stdout) || null
    } catch {
      this.ownerRepo = null
    }
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
    } catch {
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
