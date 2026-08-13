import { designPhase } from '../../src/workflows/phases/designPhase'
import { architecturePhase } from '../../src/workflows/phases/architecturePhase'
import { summarizeImpactReport } from '../../src/harness/impact'
import type { WorkflowContext } from '../../src/adapters/types'

const SAMPLE_REPORT = [
  '## 🌐 Cross-package impact analysis',
  '',
  '**Changed:** `apps/mobile/src/screens/HomeScreen.tsx`',
  '**Changed packages:** `@acme/ui`',
  '**Blast radius:** 2 package(s) · 3 file(s) · 1 screen(s) · 1 navigator(s) · 1 E2E flow(s)',
  '',
  '### Affected files',
  '- `packages/ui/src/Button.tsx` (_@acme/ui_) — imports @acme/ui',
  '- `apps/mobile/src/screens/ProfileScreen.tsx` (_mobile_) — imports @acme/ui',
  '',
  '### Screens & routes touched',
  '- ProfileScreen',
  '',
  '### Navigation stacks',
  '- apps/mobile/src/navigation/RootNavigator.tsx (RootNavigator:stack)',
  '',
  '### Re-render impact',
  '- `ProfileScreen` (_mobile_) renders `Button`',
  '',
  '### E2E flows to run',
  '- `.maestro/profile.yaml` (_mobile_) → ProfileScreen',
  '',
].join('\n')

const ISOLATED_REPORT = [
  '## 🌐 Cross-package impact analysis',
  '',
  '**Changed:** `apps/mobile/src/screens/HomeScreen.tsx`',
  '',
  '✅ No cross-package consumers found — this change appears to be isolated.',
  '',
].join('\n')

function makeCtx(prompt: string, impactOutput: string): WorkflowContext {
  return {
    projectRoot: '/tmp',
    snapshot: null,
    prompt,
    inputs: {},
    outputs: {},
    state: {
      id: 'impact-ctx-test',
      workflowId: 'feature-development',
      prompt,
      status: 'running',
      createdAt: 0,
      updatedAt: 0,
      phases: [
        {
          id: 'impact',
          name: 'Impact analysis',
          description: '',
          status: 'completed',
          output: impactOutput,
          artifacts: [],
        },
      ],
    },
    adapters: {
      design: { analyzeMotion: async () => [] },
    } as unknown as WorkflowContext['adapters'],
    modelRouter: {
      generate: async () => ({
        content: JSON.stringify({
          intents: [{ type: 'add-feature', feature: 'profile', confidence: 1, reasoning: 'test' }],
        }),
        provider: 'mock',
      }),
    } as unknown as WorkflowContext['modelRouter'],
  }
}

describe('impact context → downstream stages', () => {
  it('summarizeImpactReport parses the rendered report into structured signals', () => {
    const s = summarizeImpactReport(SAMPLE_REPORT)

    expect(s.changed).toEqual(['apps/mobile/src/screens/HomeScreen.tsx'])
    expect(s.changedPackages).toEqual(['@acme/ui'])
    expect(s.packages).toEqual(['@acme/ui', 'mobile'])
    expect(s.files).toEqual(['packages/ui/src/Button.tsx', 'apps/mobile/src/screens/ProfileScreen.tsx'])
    expect(s.screens).toEqual(['ProfileScreen'])
    expect(s.navigators).toEqual(['apps/mobile/src/navigation/RootNavigator.tsx (RootNavigator:stack)'])
    expect(s.flows).toEqual(['.maestro/profile.yaml'])
    expect(s.blastRadius).toContain('2 package(s)')
    expect(s.isolated).toBe(false)
  })

  it('design phase starts from the blast radius: affected screens, stacks, and E2E flows', async () => {
    const result = await designPhase.run(makeCtx('Add a profile feature', SAMPLE_REPORT))

    expect(result.status).toBe('completed')
    expect(result.output).toContain('## Impact-informed design')
    expect(result.output).toContain('Affected screens:')
    expect(result.output).toContain('- ProfileScreen')
    expect(result.output).toContain('Navigation stacks:')
    expect(result.output).toContain('E2E flows that must stay green:')
    expect(result.output).toContain('- `.maestro/profile.yaml`')
  })

  it('design phase marks a greenfield feature when impact found no consumers', async () => {
    const result = await designPhase.run(makeCtx('Add a profile feature', ISOLATED_REPORT))

    expect(result.status).toBe('completed')
    expect(result.output).toContain('## Impact-informed design')
    expect(result.output).toContain('no existing consumers — this screen is greenfield')
  })

  it('architecture phase documents the blast radius in the ADR', async () => {
    const result = await architecturePhase.run(makeCtx('Add a profile feature', SAMPLE_REPORT))

    expect(result.status).toBe('completed')
    expect(result.output).toContain('### Blast radius (from impact stage)')
    expect(result.output).toContain('`@acme/ui`')
    expect(result.output).toContain('Affected files (consumers to keep working):')
    expect(result.output).toContain('- `packages/ui/src/Button.tsx`')
    expect(result.output).toContain('Affected screens:')
  })
})
