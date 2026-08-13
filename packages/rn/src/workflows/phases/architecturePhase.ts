import type { WorkflowPhase } from '../../adapters/types'
import { ADRWriter } from '../../sdlc/ADRWriter'
import { phaseResult } from './helpers'
import { getIntent, isRemoveDependency, isRefactor } from './intent'
import { summarizeImpactReport, impactReportFromContext } from '../../harness/impact'

/**
 * Blast-radius section for an ADR, from the impact stage's report — the known
 * consumers the architecture must keep working.
 */
function blastRadiusSection(report: string): string {
  const impact = summarizeImpactReport(report)
  const parts: string[] = []
  if (impact.changed.length > 0) {
    parts.push('', '### Blast radius (from impact stage)', '', `- Changed: ${impact.changed.map(f => '`' + f + '`').join(', ')}`)
  }
  if (impact.changedPackages.length > 0) {
    parts.push(`- Changed packages: ${impact.changedPackages.map(p => '`' + p + '`').join(', ')}`)
  }
  if (impact.packages.length > 0) {
    parts.push(`- Affected packages: ${impact.packages.map(p => '`' + p + '`').join(', ')}`)
  }
  if (impact.files.length > 0) {
    parts.push('', 'Affected files (consumers to keep working):', ...impact.files.map(f => `- \`${f}\``))
  }
  if (impact.screens.length > 0) {
    parts.push('', 'Affected screens:', ...impact.screens.map(s => `- ${s}`))
  }
  if (impact.flows.length > 0) {
    parts.push('', 'E2E flows to keep green:', ...impact.flows.map(f => `- \`${f}\``))
  }
  if (impact.isolated && impact.changed.length > 0) {
    parts.push('', '- No existing consumers — the change is isolated; architecture is free of coupling constraints.')
  }
  return parts.join('\n')
}

export const architecturePhase: WorkflowPhase = {
  id: 'architecture',
  name: 'Architecture and API design',
  description: 'Document the architecture decision and integration approach.',
  run: async (ctx) => {
    const intent = (await getIntent(ctx)).intent
    const blast = blastRadiusSection(impactReportFromContext(ctx))

    if (isRemoveDependency(intent)) {
      const output = [
        `## Architecture decision: remove ${intent.dependency}`,
        '',
        '### Context',
        `The project currently depends on ${intent.dependency} for analytics, crash reporting, or distribution. We want to remove it cleanly without breaking builds or runtime behavior.`,
        '',
        '### Decision',
        'Remove the dependency from JavaScript packages, native pod/gradle configs, and source code imports.',
        '',
        '### Steps',
        '1. Identify all npm packages related to the dependency.',
        '2. Uninstall them and update lockfiles.',
        '3. Remove JavaScript/TypeScript imports and API calls.',
        '4. Remove native configuration (iOS Podfile, Android build.gradle).',
        '5. Verify builds and runtime startup.',
        '',
        '### Alternatives considered',
        '- Keep the dependency: rejected because it is no longer needed.',
        `- Replace with another service: only if project requirements explicitly require the capability.`,
        blast,
      ].join('\n')

      return phaseResult(
        'architecture',
        'Architecture and API design',
        'Document the architecture decision and integration approach.',
        output,
        [{ type: 'architecture', title: `ADR: remove ${intent.dependency}`, content: output }]
      )
    }

    if (isRefactor(intent)) {
      const output = [
        `## Architecture decision: refactor ${intent.target}`,
        '',
        '### Context',
        `The module ${intent.target} needs restructuring to improve maintainability without changing external behavior.`,
        '',
        '### Decision',
        'Refactor incrementally, keeping tests green and the public API stable.',
        '',
        '### Approach',
        '1. Read current implementation and identify responsibilities.',
        '2. Extract pure helpers and hooks.',
        '3. Add unit tests around existing behavior.',
        '4. Apply the refactor and verify tests still pass.',
        blast,
      ].join('\n')

      return phaseResult(
        'architecture',
        'Architecture and API design',
        'Document the architecture decision and integration approach.',
        output,
        [{ type: 'architecture', title: `ADR: refactor ${intent.target}`, content: output }]
      )
    }

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
      '- Create a feature-specific service under `src/services/`',
      '- Encapsulate all endpoint calls',
      '- Return typed responses and throw typed errors',
      '',
      '### Hook layer',
      '- Create a hook under `src/hooks/` for the feature logic',
      '- Handles loading, error, and success states',
      '- Keeps components focused on presentation',
      '',
      '### Error handling',
      '- Network errors: retry with exponential backoff',
      '- Validation errors: surface field-level messages',
      '- Auth errors: clear session and redirect to login',
    ].join('\n')

    const output = [adr, '', apiDesign, blast].join('\n')

    return phaseResult(
      'architecture',
      'Architecture and API design',
      'Document the architecture decision and integration approach.',
      output,
      [
        { type: 'architecture', title: `ADR: ${ctx.prompt}`, content: adr },
        { type: 'architecture', title: `API design: ${ctx.prompt}`, content: apiDesign },
      ]
    )
  },
}
