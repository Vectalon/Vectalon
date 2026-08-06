import type { WorkflowPhase, TaskInput } from '../../adapters/types'
import { phaseResult, failedPhase } from './helpers'
import { getIntent, isRemoveDependency, isRefactor, isFix } from './intent'

export const taskPhase: WorkflowPhase = {
  id: 'tasks',
  name: 'Task creation',
  description: 'Create implementation tasks in the configured project management tool.',
  run: async (ctx) => {
    const intent = (await getIntent(ctx)).intent
    const tasks: TaskInput[] = [
      { title: `PRD: ${ctx.prompt}`, description: 'Finalize requirements and acceptance criteria', type: 'requirements' },
      { title: `Design: ${ctx.prompt}`, description: 'Approve UX approach', type: 'design' },
    ]

    if (isRemoveDependency(intent)) {
      tasks.push(
        { title: `Uninstall ${intent.dependency}`, description: `Remove ${intent.dependency} packages and update lockfiles`, type: 'engineering' },
        { title: `Remove ${intent.dependency} imports`, description: 'Remove all JavaScript/TypeScript imports and API calls', type: 'engineering' },
        { title: `Clean up ${intent.dependency} native config`, description: 'Remove iOS/Android native configuration', type: 'engineering' },
        { title: `Verify ${intent.dependency} removal`, description: 'Run builds, tests, and app startup checks', type: 'qa' }
      )
    } else if (isRefactor(intent)) {
      tasks.push(
        { title: `Tests: ${ctx.prompt}`, description: 'Update tests against the refactored module to define expected behavior (TDD)', type: 'qa' },
        { title: `Refactor ${intent.target}`, description: 'Apply the refactor while preserving behavior', type: 'engineering' },
        { title: `Validate tests: ${ctx.prompt}`, description: 'Ensure all tests pass after refactoring', type: 'qa' }
      )
    } else if (isFix(intent)) {
      tasks.push(
        { title: `Fix ${intent.area} issues: ${ctx.prompt}`, description: 'Run the relevant check, fix every reported violation in existing files, and re-run until clean. Do not create new screens, hooks, or services.', type: 'engineering' },
        { title: `Code review: ${ctx.prompt}`, description: 'Review the fix for correctness and regressions', type: 'engineering' },
        { title: `Validate ${intent.area} fix: ${ctx.prompt}`, description: 'Re-run lint, type check, and tests to confirm all issues are resolved', type: 'qa' }
      )
    } else if (intent.type === 'unknown') {
      tasks.push(
        { title: `Clarify request: ${ctx.prompt}`, description: 'The request could not be classified. Confirm whether this is a new feature, dependency removal, refactor, or fix before implementation.', type: 'requirements' }
      )
    } else {
      tasks.push(
        { title: `Tests: ${ctx.prompt}`, description: 'Write unit, integration, and hook tests first (TDD) based on acceptance criteria', type: 'qa' },
        { title: `API service: ${ctx.prompt}`, description: 'Implement service layer and error handling to satisfy tests', type: 'engineering' },
        { title: `UI screen: ${ctx.prompt}`, description: 'Build screen following design spec to satisfy tests', type: 'engineering' },
        { title: `Code review: ${ctx.prompt}`, description: 'Review generated code for quality and best practices', type: 'engineering' },
        { title: `Validate tests: ${ctx.prompt}`, description: 'Run all tests to verify implementation satisfies requirements', type: 'qa' },
        { title: `Docs: ${ctx.prompt}`, description: 'Update README and project documentation', type: 'documentation' }
      )
    }

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
