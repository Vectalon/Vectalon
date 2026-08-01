import { logger } from '../cli/logger'
import type {
  ProjectManagementAdapter,
  Task,
  TaskInput,
} from './types'

export class ConsoleProjectManagementAdapter implements ProjectManagementAdapter {
  name = 'console'

  async createTasks(tasks: TaskInput[]): Promise<Task[]> {
    const created: Task[] = tasks.map((t, index) => ({
      id: `console-task-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'open',
    }))

    logger.dim(`  PM: created ${created.length} task(s)`)
    return created
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    logger.dim(`  PM: updated ${ids.length} task(s) to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    logger.dim(`  PM: closed ${ids.length} task(s)`)
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

  return new ConsoleProjectManagementAdapter()
}
