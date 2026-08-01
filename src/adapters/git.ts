import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from '../cli/logger'
import type { GitAdapter, CommitInput, PullRequestInput, PullRequest } from './types'

const execFileAsync = promisify(execFile)

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  logger.info(`git ${args.join(' ')}`)
  const { stdout, stderr } = await execFileAsync('git', args, { cwd })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

export class LocalGitAdapter implements GitAdapter {
  name = 'local'

  constructor(
    private root: string,
    private allowPush: boolean = false
  ) {}

  async createBranch(name: string): Promise<void> {
    await runGit(this.root, ['checkout', '-b', name])
  }

  async commit(input: CommitInput): Promise<string> {
    const files = input.files && input.files.length > 0 ? input.files : ['.']
    await runGit(this.root, ['add', ...files])
    const args = input.allowEmpty ? ['commit', '--allow-empty', '-m', input.message] : ['commit', '-m', input.message]
    const { stdout } = await runGit(this.root, args)
    return stdout
  }

  async push(branch?: string): Promise<void> {
    if (!this.allowPush) {
      logger.warn(`Skipping git push (branch: ${branch || 'current'}). Use --push or config.git.push=true to push.`)
      return
    }
    const args = branch ? ['push', '-u', 'origin', branch] : ['push']
    await runGit(this.root, args)
  }

  async createPullRequest(input: PullRequestInput): Promise<PullRequest> {
    if (!this.allowPush) {
      logger.warn(`Skipping PR creation for "${input.title}". Use --push or config.git.push=true to open a PR.`)
      return {
        id: 'local-pr-1',
        number: 1,
        url: 'https://example.com/pr/1',
        title: input.title,
      }
    }
    logger.warn(`PR creation not implemented for local git adapter. Title: "${input.title}" (${input.head} -> ${input.base || 'main'})`)
    return {
      id: 'local-pr-1',
      number: 1,
      url: 'https://example.com/pr/1',
      title: input.title,
    }
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

  async createPullRequest(input: PullRequestInput): Promise<PullRequest> {
    logger.dim(`  Git: would open PR "${input.title}" (${input.head} -> ${input.base || 'main'})`)
    return {
      id: 'console-pr-1',
      number: 1,
      url: 'https://example.com/pr/1',
      title: input.title,
    }
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

  async createPullRequest(input: PullRequestInput): Promise<PullRequest> {
    const url = `https://github.com/${this.owner}/${this.repo}/pull/1`
    logger.info(`[GitHub] Would open PR: ${input.title}`)
    return {
      id: 'github-pr-1',
      number: 1,
      url,
      title: input.title,
    }
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
