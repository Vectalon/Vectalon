import type { WorkflowPhase } from '../../adapters/types'
import { RequirementWriter } from '../../sdlc/RequirementWriter'
import { detectConventions, phaseResult } from './helpers'

export const prdPhase: WorkflowPhase = {
  id: 'prd',
  name: 'Product Requirements Document',
  description: 'Generate a PRD that captures the feature goals, audience, and acceptance criteria.',
  run: async (ctx) => {
    const writer = new RequirementWriter()
    const projectName = ctx.snapshot?.project.name || 'project'
    const prd = writer.writePRD({
      projectName,
      feature: ctx.prompt,
      featureIdeas: [ctx.prompt],
    })

    const conventions = detectConventions(ctx.snapshot)
    const contextNote = [
      'Project context considered:',
      `- TypeScript: ${conventions.hasTypeScript ? 'Yes' : 'No'}`,
      `- React Navigation: ${conventions.hasNavigation ? 'Yes' : 'No'}`,
      `- StyleSheet convention: ${conventions.usesStyleSheet ? 'Yes' : 'No'}`,
      `- Platforms: ${conventions.platforms.join(', ') || 'unknown'}`,
    ].join('\n')

    return phaseResult(
      'prd',
      'Product Requirements Document',
      'Generate a PRD that captures the feature goals, audience, and acceptance criteria.',
      `${prd}\n\n${contextNote}`,
      [{ type: 'product', title: `PRD: ${ctx.prompt}`, content: prd }]
    )
  },
}
