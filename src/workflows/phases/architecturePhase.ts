import type { WorkflowPhase } from '../../adapters/types'
import { ADRWriter } from '../../sdlc/ADRWriter'
import { phaseResult } from './helpers'

export const architecturePhase: WorkflowPhase = {
  id: 'architecture',
  name: 'Architecture and API design',
  description: 'Document the architecture decision and API integration approach.',
  run: async (ctx) => {
    const writer = new ADRWriter()
    const adr = writer.writeADR({
      title: `Architecture for: ${ctx.prompt}`,
      context: `We need to implement "${ctx.prompt}" in the React Native project while following existing conventions and minimizing risk.`,
      options: ['Add dedicated API service module', 'Inline API calls in components', 'Use a state management library'],
      decision: 'Add dedicated API service module with hooks',
    })

    const apiDesign = [
      '## API integration design',
      '',
      '### Service module',
      '- Create `src/services/AuthApi.ts` (or feature-specific service)',
      '- Encapsulate all endpoint calls',
      '- Return typed responses and throw typed errors',
      '',
      '### Hook layer',
      '- Create `src/hooks/useLogin.ts` for login logic',
      '- Handles loading, error, and success states',
      '- Keeps components focused on presentation',
      '',
      '### Error handling',
      '- Network errors: retry with exponential backoff',
      '- Validation errors: surface field-level messages',
      '- Auth errors: clear session and redirect to login',
      '',
      '### Security',
      '- Store tokens in Keychain (iOS) / Keystore (Android) via `@react-native-keychain`',
      '- Never log passwords or tokens',
      '- Use HTTPS-only endpoints',
    ].join('\n')

    const output = `${adr}\n\n${apiDesign}`

    return phaseResult(
      'architecture',
      'Architecture and API design',
      'Document the architecture decision and API integration approach.',
      output,
      [
        { type: 'architecture', title: `ADR: ${ctx.prompt}`, content: adr },
        { type: 'architecture', title: `API design: ${ctx.prompt}`, content: apiDesign },
      ]
    )
  },
}
