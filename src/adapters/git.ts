import type { GitAdapter, CommitInput, PullRequestInput, PullRequest } from './types'

export class ConsoleGitAdapter implements GitAdapter {
  name = 'console'

  async createBranch(name: string): Promise<void> {
    console.log(`[Git] Would create branch: ${name}`)
  }

  async commit(input: CommitInput): Promise<string> {
    console.log(`[Git] Would commit: ${input.message}`)
    if (input.files && input.files.length > 0) {
      console.log(`[Git] Files: ${input.files.join(', ')}`)
    }
    return 'console-sha'
  }

  async push(branch?: string): Promise<void> {
    console.log(`[Git] Would push${branch ? ` branch ${branch}` : ''}`)
  }

  async createPullRequest(input: PullRequestInput): Promise<PullRequest> {
    console.log(`[Git] Would open PR: ${input.title}`)
    console.log(`[Git] ${input.head} -> ${input.base || 'main'}`)
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
    console.log(`[GitHub] Would create branch ${name} in ${this.owner}/${this.repo}`)
  }

  async commit(input: CommitInput): Promise<string> {
    console.log(`[GitHub] Would commit ${input.message} to ${this.owner}/${this.repo}`)
    return 'github-sha'
  }

  async push(branch?: string): Promise<void> {
    console.log(`[GitHub] Would push ${branch || 'current branch'} to origin`)
  }

  async createPullRequest(input: PullRequestInput): Promise<PullRequest> {
    const url = `https://github.com/${this.owner}/${this.repo}/pull/1`
    console.log(`[GitHub] Would open PR: ${input.title}`)
    return {
      id: 'github-pr-1',
      number: 1,
      url,
      title: input.title,
    }
  }
}

export function createGitAdapter(config: Record<string, unknown>): GitAdapter {
  const provider = (config.provider as string) || 'console'

  if (provider === 'github') {
    return new GitHubAdapter(
      (config.owner as string) || '',
      (config.repo as string) || '',
      config.token as string | undefined
    )
  }

  return new ConsoleGitAdapter()
}
