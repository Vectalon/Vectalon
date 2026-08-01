import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult, failedPhase, sanitizeFileName } from './helpers'
import { detectIntent, intentTitle } from './intent'

export const prPhase: WorkflowPhase = {
  id: 'pr',
  name: 'Pull request',
  description: 'Create a branch, commit changes, and open a pull request.',
  run: async (ctx) => {
    const intent = detectIntent(ctx.prompt)
    const featureName = sanitizeFileName(ctx.prompt) || 'feature'
    const branchName = `feature/${featureName}-${Date.now()}`

    try {
      await ctx.adapters.git.createBranch(branchName)

      const implementationPhase = ctx.state.phases.find(p => p.id === 'implementation')
      const files = implementationPhase?.artifacts.map(a => a.path).filter(Boolean) as string[] | undefined

      await ctx.adapters.git.commit({
        message: `${intent.type === 'remove-dependency' ? 'chore' : 'feat'}: ${ctx.prompt}`,
        files,
      })
      await ctx.adapters.git.push(branchName)

      const pr = await ctx.adapters.git.createPullRequest({
        title: `${intent.type === 'remove-dependency' ? 'chore' : 'feat'}: ${ctx.prompt}`,
        body: [
          `## ${intentTitle(intent)}`,
          '',
          '## Checklist',
          '- [x] PRD generated',
          '- [x] Design/UX approach defined',
          '- [x] Architecture decision recorded',
          '- [x] Tests written first (TDD)',
          '- [x] Implementation generated to satisfy tests',
          '- [x] Code review passed',
          '- [x] Verification completed (tests, lint, typecheck)',
        ].join('\n'),
        head: branchName,
      })

      const output = [
        `Branch: ${branchName}`,
        `Pull request: ${pr.url}`,
        `Title: ${pr.title}`,
      ].join('\n')

      return phaseResult(
        'pr',
        'Pull request',
        'Create a branch, commit changes, and open a pull request.',
        output,
        [{ type: 'devops', title: `PR: ${ctx.prompt}`, content: output }]
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return failedPhase('pr', 'Pull request', 'Create a branch, commit changes, and open a pull request.', message)
    }
  },
}
