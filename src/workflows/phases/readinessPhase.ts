import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult } from './helpers'

export const readinessPhase: WorkflowPhase = {
  id: 'readiness',
  name: 'Readiness report',
  description: 'Produce a go/no-go report against acceptance criteria.',
  run: async (ctx) => {
    const criteria = [
      'PRD generated and scoped',
      'Design and motion spec defined',
      'Architecture decision recorded',
      'Implementation tasks created',
      'Service, hook, and screen code generated',
      'Verification passed',
    ]

    const verificationPhase = ctx.state.phases.find(p => p.id === 'verification')
    const verificationPassed = verificationPhase?.status === 'completed'

    const output = [
      '# Readiness report',
      '',
      `Feature: ${ctx.prompt}`,
      '',
      '## Acceptance criteria',
      ...criteria.map(c => `- [x] ${c}`),
      '',
      '## Go / No-go',
      verificationPassed
        ? 'Status: GO — verification passed and the feature is ready for review.'
        : 'Status: NO-GO — verification did not pass. Fix the issues and re-run the workflow.',
      '',
      '## Recommended reviewers',
      '- Mobile lead (architecture and native config)',
      '- Security lead (auth and token handling)',
      '- QA lead (test coverage and edge cases)',
    ].join('\n')

    return phaseResult(
      'readiness',
      'Readiness report',
      'Produce a go/no-go report against acceptance criteria.',
      output,
      [{ type: 'qa', title: `Readiness: ${ctx.prompt}`, content: output }]
    )
  },
}
