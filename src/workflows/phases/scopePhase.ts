import type { WorkflowPhase } from '../../adapters/types'
import { detectConventions, phaseResult } from './helpers'
import { getIntent, intentTitle, isRemoveDependency, isAddFeature, isRefactor, isFix } from './intent'

export const scopePhase: WorkflowPhase = {
  id: 'scope',
  name: 'Feature scoping and impact analysis',
  description: 'Identify affected areas, new dependencies, and risks for the feature.',
  run: async (ctx) => {
    const conventions = detectConventions(ctx.snapshot)
    const components = ctx.snapshot?.components || []
    const deps = ctx.snapshot?.project.dependencies || {}
    const intent = (await getIntent(ctx)).intent

    const lines: string[] = [
      `# ${intentTitle(intent)}`,
      '',
      `Detected intent: ${intent.type}`,
      '',
    ]

    if (isAddFeature(intent)) {
      const affectedAreas: string[] = []
      const dependenciesToAdd: string[] = []

      if (intent.feature.toLowerCase().includes('login')) {
        affectedAreas.push('Authentication flow', 'Navigation', 'Session management', 'Secure storage')
        if (!deps['@react-native-async-storage/async-storage'] && !deps['react-native-keychain']) {
          dependenciesToAdd.push('@react-native-async-storage/async-storage or react-native-keychain')
        }
      }
      if (intent.feature.toLowerCase().includes('api')) {
        affectedAreas.push('API service layer', 'Networking', 'Error handling', 'State management')
        if (!deps['axios'] && !deps['ky'] && !deps['react-query'] && !deps['@tanstack/react-query']) {
          dependenciesToAdd.push('axios (or fetch wrapper)')
        }
      }
      if (intent.feature.toLowerCase().includes('screen') || intent.feature.toLowerCase().includes('page')) {
        affectedAreas.push('Screen components', 'Navigation registration', 'UI tests')
      }
      if (affectedAreas.length === 0) {
        affectedAreas.push('UI components', 'Business logic', 'Tests')
      }

      lines.push(
        '## Affected areas',
        ...affectedAreas.map(a => `- ${a}`),
        '',
        '## New dependencies to evaluate',
        dependenciesToAdd.length > 0
          ? dependenciesToAdd.map(d => `- ${d}`).join('\n')
          : '- None identified; prefer built-in React Native APIs'
      )
    }

    if (isRemoveDependency(intent)) {
      const matches = Object.keys(deps).filter(name =>
        name.toLowerCase().includes(intent.dependency.toLowerCase())
      )
      const devMatches = Object.keys(ctx.snapshot?.project.devDependencies || {}).filter(name =>
        name.toLowerCase().includes(intent.dependency.toLowerCase())
      )
      const usages = components.filter(c =>
        c.imports.some(imp => imp.toLowerCase().includes(intent.dependency.toLowerCase()))
      )

      lines.push(
        `## Target dependency: ${intent.dependency}`,
        '',
        '## Installed packages matching',
        matches.length > 0 || devMatches.length > 0
          ? [
              ...matches.map(m => `- ${m} (dependency)`),
              ...devMatches.map(m => `- ${m} (devDependency)`),
            ].join('\n')
          : `- No installed package matching "${intent.dependency}" found in package.json.`,
        '',
        '## Source files that import it',
        usages.length > 0
          ? usages.map(c => `- \`${c.filePath}\``).join('\n')
          : `- No imports of "${intent.dependency}" found in scanned components.`,
        '',
        '## Risks',
        '- Native build files may contain configuration that must be removed manually.',
        '- If the dependency is referenced from native modules, iOS/Android builds will fail until the native side is updated.',
        '- Verify that no runtime code references removed APIs on app startup.'
      )
    }

    if (isRefactor(intent)) {
      lines.push(
        `## Target: ${intent.target}`,
        '',
        '## Affected areas',
        '- Code structure and module boundaries',
        '- Existing tests that cover the target',
        '- Imports and consumers of the refactored module',
        '',
        '## Risks',
        '- Public API changes can break consumers.',
        '- Refactors without tests increase regression risk.',
        '- Native dependencies referenced by the module may need updated paths.'
      )
    }

    if (isFix(intent)) {
      lines.push(
        '## Affected areas',
        `- Source files with ${intent.area} violations`,
        '- Lint / type / test configuration that gates the check',
        '- CI and verification scripts that run the check',
        '',
        '## Risks',
        '- Fixes must preserve public APIs and existing behavior.',
        '- Auto-applied fixes should be reviewed before committing.',
        '- Re-run the full verification suite (lint, type check, tests) after fixing.'
      )
    }

    if (intent.type === 'unknown') {
      lines.push(
        '## Affected areas',
        '- UI components',
        '- Business logic',
        '- Tests',
        '',
        '## New dependencies to evaluate',
        '- None identified automatically; review the prompt and project dependencies.'
      )
    }

    lines.push(
      '',
      '## Existing conventions',
      `- TypeScript: ${conventions.hasTypeScript ? 'Yes' : 'No'}`,
      `- React Navigation: ${conventions.hasNavigation ? 'Yes' : 'No'}`,
      `- StyleSheet usage: ${conventions.usesStyleSheet ? 'Yes' : 'No'}`,
      `- Existing components: ${components.length}`
    )

    const output = lines.join('\n')

    return phaseResult(
      'scope',
      'Feature scoping and impact analysis',
      'Identify affected areas, new dependencies, and risks for the feature.',
      output,
      [{ type: 'research', title: `Scope: ${ctx.prompt}`, content: output }]
    )
  },
}
