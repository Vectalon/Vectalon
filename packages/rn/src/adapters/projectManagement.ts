import { logger } from '../cli/logger'
import { reportError } from '../utils/safe'
import { runCommand } from './runCommand'
import type {
  ProjectManagementAdapter,
  Task,
  TaskInput,
  Ticket,
} from './types'

const GITHUB_API = 'https://api.github.com'
const FETCH_TIMEOUT_MS = 15_000

/** fetch with an AbortController timeout so a slow network never hangs the CLI. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Deterministic stub ticket — keeps ticket-to-PR flows runnable headlessly. */
function stubTicket(key: string, provider: string): Ticket {
  return {
    key,
    title: key,
    description: `Imported from ticket ${key} via the ${provider} PM adapter (no live provider credentials configured).`,
    fetched: false,
  }
}

export class ConsoleProjectManagementAdapter implements ProjectManagementAdapter {
  name = 'console'

  // Monotonic id counter + in-memory task store: ids never restart per
  // createTasks call (so store keys stay unique across runs), and findTasks
  // can dedup against tasks created earlier in this process.
  private nextId = 1
  private store = new Map<string, Task>()

  async createTasks(tasks: TaskInput[]): Promise<Task[]> {
    const created: Task[] = tasks.map(t => {
      const task: Task = {
        id: `console-task-${this.nextId++}`,
        title: t.title,
        description: t.description,
        status: 'open',
        labels: t.labels,
      }
      this.store.set(task.id, task)
      return task
    })

    logger.dim(`  PM: created ${created.length} task(s)`)
    return created
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    for (const id of ids) {
      const task = this.store.get(id)
      if (task) {
        task.status = status
        this.store.set(id, task)
      }
    }
    logger.dim(`  PM: updated ${ids.length} task(s) to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    for (const id of ids) {
      const task = this.store.get(id)
      if (task) {
        task.status = 'closed'
        this.store.set(id, task)
      }
    }
    logger.dim(`  PM: closed ${ids.length} task(s)`)
  }

  /**
   * Open tasks matching the filter — title fragment (case-insensitive) AND any
   * of the given labels. Closed tasks are never returned, so a follow-up that
   * was already closed does not block a new one.
   */
  async findTasks(filter: { title?: string; labels?: string[] } = {}): Promise<Task[]> {
    const title = filter.title?.toLowerCase()
    const labels = filter.labels || []
    return [...this.store.values()].filter(task => {
      if (task.status === 'closed') return false
      if (title && !task.title.toLowerCase().includes(title)) return false
      if (labels.length > 0 && !labels.some(label => task.labels?.includes(label))) return false
      return true
    })
  }

  async readTicket(key: string): Promise<Ticket | null> {
    if (!key) return null
    return stubTicket(key, 'console')
  }
}

export class JiraAdapter implements ProjectManagementAdapter {
  name = 'jira'

  constructor(
    private baseUrl: string,
    private projectKey: string,
    private email?: string,
    private token?: string
  ) {}

  async createTasks(tasks: TaskInput[]): Promise<Task[]> {
    logger.info(`[Jira] Would create ${tasks.length} issue(s) in ${this.projectKey}`)
    return tasks.map((t, index) => ({
      id: `${this.projectKey}-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'open',
    }))
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    logger.info(`[Jira] Would transition ${ids.length} issue(s) to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    logger.info(`[Jira] Would close ${ids.length} issue(s)`)
  }

  async readTicket(key: string): Promise<Ticket | null> {
    if (!key) return null
    // Live fetch when the base URL + basic-auth credentials are configured;
    // otherwise fall back to the deterministic stub.
    if (this.baseUrl && this.token) {
      try {
        const response = await fetchWithTimeout(`${this.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.email || ''}:${this.token}`).toString('base64')}`,
            Accept: 'application/json',
          },
        })
        if (response.ok) {
          const data = (await response.json()) as { key: string; fields?: { summary?: string; description?: string } }
          return {
            key: data.key || key,
            title: data.fields?.summary || key,
            description: data.fields?.description || '',
            url: `${this.baseUrl}/browse/${key}`,
            fetched: true,
          }
        }
        logger.warn(`[Jira] Could not fetch ${key} (HTTP ${response.status}) — using deterministic stub`)
      } catch (err) {
        reportError(err, 'jira: reading ticket')
        logger.warn(`[Jira] Could not fetch ${key} — using deterministic stub`)
      }
    } else {
      logger.info(`[Jira] No credentials configured — using deterministic stub for ${key}`)
    }
    return stubTicket(key, 'jira')
  }
}

export class MondayAdapter implements ProjectManagementAdapter {
  name = 'monday'

  constructor(private boardId: string, private token?: string) {}

  async createTasks(tasks: TaskInput[]): Promise<Task[]> {
    logger.info(`[Monday] Would create ${tasks.length} item(s) on board ${this.boardId}`)
    return tasks.map((t, index) => ({
      id: `monday-${this.boardId}-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'open',
    }))
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    logger.info(`[Monday] Would update ${ids.length} item(s) to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    logger.info(`[Monday] Would close ${ids.length} item(s)`)
  }

  async readTicket(key: string): Promise<Ticket | null> {
    if (!key) return null
    return stubTicket(key, 'monday')
  }
}

/**
 * GitHub issues as a project-management provider. Task CRUD is a best-effort
 * log (consistent with the other remote PM adapters); `readTicket` reads a real
 * issue via the `gh` CLI (from the repo at `root`) or the REST API when a token
 * is available, falling back to the deterministic stub otherwise.
 */
export class GitHubIssueAdapter implements ProjectManagementAdapter {
  name = 'github'

  constructor(
    private options: { root?: string; token?: string; owner?: string; repo?: string } = {}
  ) {}

  async createTasks(tasks: TaskInput[]): Promise<Task[]> {
    logger.info(`[GitHub] Would create ${tasks.length} issue(s)`)
    return tasks.map((t, index) => ({
      id: `github-issue-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'open',
    }))
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    logger.info(`[GitHub] Would update ${ids.length} issue(s) to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    logger.info(`[GitHub] Would close ${ids.length} issue(s)`)
  }

  async readTicket(key: string): Promise<Ticket | null> {
    if (!key) return null
    const repoArg = this.options.owner && this.options.repo
      ? `${this.options.owner}/${this.options.repo}`
      : undefined

    // gh CLI — works in any checkout with a GitHub remote.
    if (this.options.root) {
      try {
        const args = ['issue', 'view', key, '--json', 'number,title,body,url']
        if (repoArg) args.push('--repo', repoArg)
        const result = await runCommand('gh', args, { cwd: this.options.root, timeout: 20000 })
        if (result.success) {
          const data = JSON.parse(result.stdout) as { number: number; title: string; body?: string; url?: string }
          return {
            key,
            title: data.title || key,
            description: data.body || '',
            url: data.url,
            fetched: true,
          }
        }
      } catch (err) {
        reportError(err, 'github: reading ticket via gh')
      }
    }

    // REST fallback when the gh CLI is missing but a token + repo are configured.
    const token = this.options.token || process.env.GITHUB_TOKEN
    if (token && repoArg) {
      try {
        const response = await fetchWithTimeout(`${GITHUB_API}/repos/${repoArg}/issues/${encodeURIComponent(key)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'rn-vectalon',
          },
        })
        if (response.ok) {
          const data = (await response.json()) as { number: number; title: string; body?: string; html_url?: string }
          return {
            key,
            title: data.title || key,
            description: data.body || '',
            url: data.html_url,
            fetched: true,
          }
        }
      } catch (err) {
        reportError(err, 'github: reading ticket via API')
      }
    }

    logger.info(`[GitHub] Could not fetch ${key} — using deterministic stub (install \`gh\` or set GITHUB_TOKEN + owner/repo)`)
    return stubTicket(key, 'github')
  }
}

export function createProjectManagementAdapter(config: Record<string, unknown>): ProjectManagementAdapter {
  const provider = (config.provider as string) || 'console'

  if (provider === 'jira') {
    return new JiraAdapter(
      (config.baseUrl as string) || '',
      (config.projectKey as string) || '',
      config.email as string | undefined,
      config.token as string | undefined
    )
  }

  if (provider === 'monday') {
    return new MondayAdapter(
      (config.boardId as string) || '',
      config.token as string | undefined
    )
  }

  if (provider === 'github') {
    return new GitHubIssueAdapter({
      root: config.root as string | undefined,
      token: config.token as string | undefined,
      owner: config.owner as string | undefined,
      repo: config.repo as string | undefined,
    })
  }

  return new ConsoleProjectManagementAdapter()
}
