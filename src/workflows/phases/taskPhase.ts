import type { WorkflowPhase, TaskInput } from '../../adapters/types'
import { phaseResult, failedPhase } from './helpers'

export const taskPhase: WorkflowPhase = {
  id: 'tasks',
  name: 'Task creation',
  description: 'Create implementation tasks in the configured project management tool.',
  run: async (ctx) => {
    const tasks: TaskInput[] = [
      { title: `PRD: ${ctx.prompt}`, description: 'Finalize requirements and acceptance criteria', type: 'requirements' },
      { title: `Design: ${ctx.prompt}`, description: 'Approve wireframes and motion spec', type: 'design' },
      { title: `API service: ${ctx.prompt}`, description: 'Implement service layer and error handling', type: 'engineering' },
      { title: `UI screen: ${ctx.prompt}`, description: 'Build login screen following design spec', type: 'engineering' },
      { title: `Tests: ${ctx.prompt}`, description: 'Unit tests, integration tests, and simulator checks', type: 'qa' },
      { title: `Docs: ${ctx.prompt}`, description: 'Update README and project documentation', type: 'documentation' },
    ]

    try {
      const created = await ctx.adapters.projectManagement.createTasks(tasks)
      const output = [
        `Created ${created.length} tasks via ${ctx.adapters.projectManagement.name}`,
        '',
        ...created.map(t => `- ${t.id}: ${t.title} (${t.status})`),
      ].join('\n')

      return phaseResult(
        'tasks',
        'Task creation',
        'Create implementation tasks in the configured project management tool.',
        output,
        [{ type: 'requirements', title: `Tasks: ${ctx.prompt}`, content: output }]
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPhase('tasks', 'Task creation', 'Create implementation tasks in the configured project management tool.', message)
    }
  },
}
