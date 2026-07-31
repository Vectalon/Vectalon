import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult, failedPhase } from './helpers'

export const closePhase: WorkflowPhase = {
  id: 'close',
  name: 'Close feature board',
  description: 'Mark project management tasks as complete for the feature.',
  run: async (ctx) => {
    const taskPhase = ctx.state.phases.find(p => p.id === 'tasks')
    const ids = taskPhase?.artifacts
      .flatMap(a => {
        const matches = a.content.match(/console-task-\d+/g)
        return matches || []
      })
      .filter(Boolean) || []

    try {
      await ctx.adapters.projectManagement.closeTasks(ids)

      const output = ids.length > 0
        ? `Closed ${ids.length} task(s) in ${ctx.adapters.projectManagement.name}: ${ids.join(', ')}`
        : `No tracked tasks to close in ${ctx.adapters.projectManagement.name}`

      return phaseResult(
        'close',
        'Close feature board',
        'Mark project management tasks as complete for the feature.',
        output,
        [{ type: 'operations', title: `Close: ${ctx.prompt}`, content: output }]
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPhase('close', 'Close feature board', 'Mark project management tasks as complete for the feature.', message)
    }
  },
}
