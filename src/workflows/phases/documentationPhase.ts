import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult } from './helpers'
import { detectIntent, intentTitle, isRemoveDependency } from './intent'

export const documentationPhase: WorkflowPhase = {
  id: 'documentation',
  name: 'Documentation update',
  description: 'Draft README and CHANGELOG updates for the feature.',
  run: async (ctx) => {
    const intent = detectIntent(ctx.prompt)
    const changelogSection = isRemoveDependency(intent) ? '### Removed' : '### Added'

    const changelog = [
      `## [Unreleased]`,
      '',
      changelogSection,
      `- ${ctx.prompt}`,
      '',
    ].join('\n')

    const readmeSection = [
      `### ${intentTitle(intent)}`,
      '',
      isRemoveDependency(intent)
        ? 'This change removes a dependency and updates native configuration.'
        : 'This feature adds a new screen and API integration.',
      '',
      '#### Configuration',
      isRemoveDependency(intent)
        ? '- Verify native build files are updated after uninstalling the package.'
        : '- Set `API_BASE_URL` in your environment config',
    ].join('\n')

    const output = [
      '# Documentation updates',
      '',
      '## CHANGELOG.md',
      '```markdown',
      changelog,
      '```',
      '',
      '## README.md',
      '```markdown',
      readmeSection,
      '```',
    ].join('\n')

    return phaseResult(
      'documentation',
      'Documentation update',
      'Draft README and CHANGELOG updates for the feature.',
      output,
      [
        { type: 'devops', title: `CHANGELOG: ${ctx.prompt}`, content: changelog },
        { type: 'devops', title: `README: ${ctx.prompt}`, content: readmeSection },
      ]
    )
  },
}
