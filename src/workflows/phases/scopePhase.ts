import type { WorkflowPhase } from '../../adapters/types'
import { detectConventions, phaseResult } from './helpers'

export const scopePhase: WorkflowPhase = {
  id: 'scope',
  name: 'Feature scoping and impact analysis',
  description: 'Identify affected areas, new dependencies, and risks for the feature.',
  run: async (ctx) => {
    const conventions = detectConventions(ctx.snapshot)
    const components = ctx.snapshot?.components || []
    const deps = ctx.snapshot?.project.dependencies || {}

    const affectedAreas: string[] = []
    if (ctx.prompt.toLowerCase().includes('login')) {
      affectedAreas.push('Authentication flow', 'Navigation', 'Session management', 'Secure storage')
    }
    if (ctx.prompt.toLowerCase().includes('api')) {
      affectedAreas.push('API service layer', 'Networking', 'Error handling', 'State management')
    }
    if (ctx.prompt.toLowerCase().includes('screen') || ctx.prompt.toLowerCase().includes('page')) {
      affectedAreas.push('Screen components', 'Navigation registration', 'UI tests')
    }
    if (affectedAreas.length === 0) {
      affectedAreas.push('UI components', 'Business logic', 'Tests')
    }

    const dependenciesToAdd: string[] = []
    if (ctx.prompt.toLowerCase().includes('login')) {
      dependenciesToAdd.push('@react-native-async-storage/async-storage or react-native-keychain')
    }
    if (ctx.prompt.toLowerCase().includes('api')) {
      if (!deps['axios'] && !deps['ky'] && !deps['react-query'] && !deps['@tanstack/react-query']) {
        dependenciesToAdd.push('axios (or fetch wrapper)')
      }
    }

    const output = [
      `# Feature Scope & Impact Analysis: ${ctx.prompt}`,
      '',
      '## Affected areas',
      ...affectedAreas.map(a => `- ${a}`),
      '',
      '## New dependencies to evaluate',
      dependenciesToAdd.length > 0
        ? dependenciesToAdd.map(d => `- ${d}`).join('\n')
        : '- None identified; prefer built-in React Native APIs',
      '',
      '## Existing conventions',
      `- TypeScript: ${conventions.hasTypeScript ? 'Yes' : 'No'}`,
      `- React Navigation: ${conventions.hasNavigation ? 'Yes' : 'No'}`,
      `- StyleSheet usage: ${conventions.usesStyleSheet ? 'Yes' : 'No'}`,
      `- Existing components: ${components.length}`,
      '',
      '## Risks',
      '- API integration may require environment-specific configuration',
      '- Authentication flows need secure token storage',
      '- New screens must follow existing navigation patterns',
    ].join('\n')

    return phaseResult(
      'scope',
      'Feature scoping and impact analysis',
      'Identify affected areas, new dependencies, and risks for the feature.',
      output,
      [{ type: 'research', title: `Scope: ${ctx.prompt}`, content: output }]
    )
  },
}
