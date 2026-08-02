import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult, detectConventions } from './helpers'
import { getIntent, intentTitle, isRemoveDependency, isRefactor } from './intent'

export const designPhase: WorkflowPhase = {
  id: 'design',
  name: 'Design and UX specification',
  description: 'Generate wireframes, extract design tokens, and apply motion design principles.',
  run: async (ctx) => {
    const conventions = detectConventions(ctx.snapshot)
    const intent = (await getIntent(ctx)).intent

    if (isRemoveDependency(intent) || isRefactor(intent)) {
      const output = [
        `## Design / UX for: ${intentTitle(intent)}`,
        '',
        'This request does not introduce new UI, so no wireframes are required.',
        '',
        '### UX considerations',
        '- Ensure no user-facing behavior changes unless explicitly required.',
        '- If removing analytics/crash reporting, consider whether user consent flows need updates.',
        '- Preserve existing loading, error, and success states.',
        '',
        conventions.usesStyleSheet
          ? 'Use StyleSheet.create for any retained styles to match project convention.'
          : 'Use the project’s existing styling approach for any retained styles.',
      ].join('\n')

      return phaseResult(
        'design',
        'Design and UX specification',
        'Generate wireframes, extract design tokens, and apply motion design principles.',
        output,
        [{ type: 'design', title: `UX notes: ${ctx.prompt}`, content: output }]
      )
    }

    const wireframe = [
      '```',
      '+------------------+',
      '| Feature Screen   |',
      '|                  |',
      '|  [Content]       |',
      '|                  |',
      '|  [Actions]       |',
      '|                  |',
      '+------------------+',
      '```',
    ].join('\n')

    const designSpec = [
      '## Design specification',
      '',
      '### Screen structure',
      '- Header: title or primary action',
      '- Body: feature-specific content',
      '- Footer: secondary actions',
      '',
      '### Interaction notes',
      '- Provide clear loading and error states.',
      '- Use consistent spacing and typography with existing screens.',
    ].join('\n')

    const motion = await ctx.adapters.design.analyzeMotion(designSpec)
    const motionTable = [
      '## Motion design recommendations',
      '',
      '| Element | Intent | Primary | Duration | Easing | Notes |',
      '|---|---|---|---|---|---|',
      ...motion.map(m => `| ${m.element} | ${m.intent} | ${m.primaryProperty} | ${m.duration}ms | ${m.easing} | ${m.notes} |`),
    ].join('\n')

    const output = [designSpec, '', motionTable, '', wireframe, '',
      conventions.usesStyleSheet
        ? 'Use StyleSheet.create for all styles to match project convention.'
        : 'Use inline styles or the project’s existing styling approach.'
    ].join('\n')

    return phaseResult(
      'design',
      'Design and UX specification',
      'Generate wireframes, extract design tokens, and apply motion design principles.',
      output,
      [
        { type: 'design', title: `Wireframe: ${ctx.prompt}`, content: wireframe },
        { type: 'design', title: `Motion spec: ${ctx.prompt}`, content: motionTable },
      ]
    )
  },
}
