import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult, detectConventions } from './helpers'
import { getIntent, intentTitle, isRemoveDependency, isRefactor } from './intent'
import { summarizeImpactReport, impactReportFromContext } from '../../harness/impact'

export const designPhase: WorkflowPhase = {
  id: 'design',
  name: 'Design and UX specification',
  description: 'Generate wireframes, extract design tokens, and apply motion design principles.',
  run: async (ctx) => {
    const conventions = detectConventions(ctx.snapshot)
    const intent = (await getIntent(ctx)).intent
    // The impact stage ran before this one — design starts from the known
    // blast radius: which existing screens, stacks, and flows must stay
    // visually consistent with the new feature.
    const impact = summarizeImpactReport(impactReportFromContext(ctx))

    if (isRemoveDependency(intent) || isRefactor(intent)) {
      const impactNotes =
        impact.files.length > 0
          ? [
              '',
              '### Impact-informed UX notes',
              '',
              'The impact stage identified these files as consumers of this change — their UX must be preserved exactly:',
              '',
              ...impact.files.map(f => `- \`${f}\``),
            ]
          : []
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
        ...impactNotes,
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

    const impactSection = (() => {
      if (impact.isolated) {
        return [
          '',
          '## Impact-informed design',
          '',
          '- Impact analysis found no existing consumers — this screen is greenfield. Match project conventions (StyleSheet, spacing, typography) so future screens stay consistent.',
        ].join('\n')
      }
      if (impact.screens.length + impact.navigators.length + impact.flows.length === 0) {
        return ''
      }
      return [
        '',
        '## Impact-informed design',
        '',
        'This feature touches existing UI — design the new screen to stay visually consistent with what it affects:',
        ...(impact.screens.length > 0 ? ['', 'Affected screens:', ...impact.screens.map(s => `- ${s}`)] : []),
        ...(impact.navigators.length > 0 ? ['', 'Navigation stacks:', ...impact.navigators.map(n => `- ${n}`)] : []),
        ...(impact.flows.length > 0 ? ['', 'E2E flows that must stay green:', ...impact.flows.map(f => `- \`${f}\``)] : []),
      ].join('\n')
    })()

    const output = [designSpec, '', motionTable, '', wireframe, '',
      conventions.usesStyleSheet
        ? 'Use StyleSheet.create for all styles to match project convention.'
        : 'Use inline styles or the project’s existing styling approach.',
      impactSection
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
