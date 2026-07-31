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

    console.log('[PM] Would create tasks:')
    for (const task of created) {
      console.log(`  - ${task.id}: ${task.title}`)
    }
    return created
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    console.log(`[PM] Would update tasks ${ids.join(', ')} to status ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    console.log(`[PM] Would close tasks ${ids.join(', ')}`)
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
    console.log(`[Jira] Would create ${tasks.length} issue(s) in ${this.projectKey} at ${this.baseUrl}`)
    return tasks.map((t, index) => ({
      id: `${this.projectKey}-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'open',
    }))
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    console.log(`[Jira] Would transition ${ids.join(', ')} to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    console.log(`[Jira] Would close ${ids.join(', ')}`)
  }
}

export class MondayAdapter implements ProjectManagementAdapter {
  name = 'monday'

  constructor(private boardId: string, private token?: string) {}

  async createTasks(tasks: TaskInput[]): Promise<Task[]> {
    console.log(`[Monday] Would create ${tasks.length} item(s) on board ${this.boardId}`)
    return tasks.map((t, index) => ({
      id: `monday-${this.boardId}-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'open',
    }))
  }

  async updateTasks(ids: string[], status: string): Promise<void> {
    console.log(`[Monday] Would update ${ids.join(', ')} to ${status}`)
  }

  async closeTasks(ids: string[]): Promise<void> {
    console.log(`[Monday] Would close ${ids.join(', ')}`)
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
