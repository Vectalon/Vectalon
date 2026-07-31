import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult, detectConventions } from './helpers'

export const designPhase: WorkflowPhase = {
  id: 'design',
  name: 'Design and UX specification',
  description: 'Generate wireframes, extract design tokens, and apply motion design principles.',
  run: async (ctx) => {
    const conventions = detectConventions(ctx.snapshot)
    const wireframe = [
      '```',
      '+------------------+',
      '| Login Screen     |',
      '|                  |',
      '|  [Logo]          |',
      '|                  |',
      '|  Email input     |',
      '|  Password input  |',
      '|                  |',
      '|  [Sign In]       |',
      '|                  |',
      '|  Forgot password?|',
      '|  Create account  |',
      '+------------------+',
      '```',
    ].join('\n')

    const designSpec = [
      '## Design specification',
      '',
      '### Screen structure',
      '- Header: app logo or screen title',
      '- Form: email + password inputs with labels',
      '- Primary action: Sign In button',
      '- Secondary actions: Forgot password, Create account',
      '',
      '### Input behavior',
      '- Email: auto-capitalize off, keyboard type email-address',
      '- Password: secure text entry, toggle visibility optional',
      '',
      '### Motion and feedback',
      wireframe,
    ].join('\n')

    const motion = await ctx.adapters.design.analyzeMotion(designSpec)
    const motionTable = [
      '## Motion design recommendations',
      '',
      '| Element | Intent | Primary | Duration | Easing | Notes |',
      '|---|---|---|---|---|---|',
      ...motion.map(m => `| ${m.element} | ${m.intent} | ${m.primaryProperty} | ${m.duration}ms | ${m.easing} | ${m.notes} |`),
    ].join('\n')

    const output = [designSpec, '', motionTable, '',
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
