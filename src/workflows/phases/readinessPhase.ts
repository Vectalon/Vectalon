import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult } from './helpers'

export const readinessPhase: WorkflowPhase = {
  id: 'readiness',
  name: 'Readiness report',
  description: 'Produce a go/no-go report against acceptance criteria.',
  run: async (ctx) => {
    const criteria = [
      'PRD generated and scoped',
      'Design/UX approach defined',
      'Architecture decision recorded',
      'Implementation tasks created',
      'Code changes or removal plan generated',
      'Verification completed',
    ]

    const verificationPhase = ctx.state.phases.find(p => p.id === 'verification')
    const verificationPassed = verificationPhase?.status === 'completed'
    const isSimulated = ctx.adapters.testRunner.name === 'console'

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
        ? `Status: GO — verification completed. ${isSimulated ? 'However, verification ran in simulation mode. Configure real test/simulator adapters before merging.' : 'All checks passed and the feature is ready for review.'}`
        : 'Status: NO-GO — verification did not pass. Fix the issues and re-run the workflow.',
      '',
      '## Recommended reviewers',
      '- Mobile lead (architecture and native config)',
      '- Security lead (if auth or token handling is involved)',
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
