import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult } from './helpers'

export const documentationPhase: WorkflowPhase = {
  id: 'documentation',
  name: 'Documentation update',
  description: 'Draft README and CHANGELOG updates for the feature.',
  run: async (ctx) => {
    const changelog = [
      `## [Unreleased]`,
      '',
      '### Added',
      `- ${ctx.prompt}`,
      '',
    ].join('\n')

    const readmeSection = [
      `### ${ctx.prompt}`,
      '',
      'This feature adds a new screen and API integration.',
      '',
      '#### Usage',
      '```tsx',
      `import { ${sanitizeName(ctx.prompt)}Screen } from './src/screens/${sanitizeName(ctx.prompt)}Screen';`,
      '',
      '<NavigationStack.Screen name="Login" component={LoginScreen} />',
      '```',
      '',
      '#### Configuration',
      '- Set `API_BASE_URL` in your environment config',
      '- Configure secure storage for auth tokens',
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

function sanitizeName(prompt: string): string {
  return prompt
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .slice(0, 30)
}
