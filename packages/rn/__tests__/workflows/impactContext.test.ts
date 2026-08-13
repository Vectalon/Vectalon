import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { designPhase } from '../../src/workflows/phases/designPhase'
import { architecturePhase } from '../../src/workflows/phases/architecturePhase'
import { testPhase } from '../../src/workflows/phases/testPhase'
import { taskPhase } from '../../src/workflows/phases/taskPhase'
import { implementationPhase, buildImplementationPrompt } from '../../src/workflows/phases/implementationPhase'
import { summarizeImpactReport, renderBlastRadiusContext } from '../../src/harness/impact'
import { MaestroFlowWriter } from '../../src/sdlc/MaestroFlowWriter'
import type { WorkflowContext, TaskInput } from '../../src/adapters/types'

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

  it('renderBlastRadiusContext lists consumers for the implementation stage', () => {
    const rich = renderBlastRadiusContext(summarizeImpactReport(SAMPLE_REPORT))
    expect(rich).toContain('Consumer files')
    expect(rich).toContain('- `packages/ui/src/Button.tsx`')
    expect(rich).toContain('Affected packages: `@acme/ui`, `mobile`')
    expect(rich).toContain('Affected screens:')
    expect(rich).toContain('E2E flows that must stay green:')

    const isolated = renderBlastRadiusContext(summarizeImpactReport(ISOLATED_REPORT))
    expect(isolated).toContain('no existing consumers — the change is isolated')

    expect(renderBlastRadiusContext(summarizeImpactReport(''))).toBe('')
  })

  it('implementation prompt carries the blast radius so generated code protects consumers', () => {
    const blast = renderBlastRadiusContext(summarizeImpactReport(SAMPLE_REPORT))
    const { prompt } = buildImplementationPrompt({
      snapshot: null,
      prompt: 'Add a profile feature',
      intent: { type: 'add-feature', feature: 'profile', description: '' },
      blastRadius: blast,
    })

    expect(prompt).toContain('## Blast radius — keep these consumers working')
    expect(prompt).toContain('- `packages/ui/src/Button.tsx`')
  })

  it('refactor implementation plan lists the impact-flagged consumers', async () => {
    const result = await implementationPhase.run({
      ...makeCtx('Refactor user-service', SAMPLE_REPORT),
      modelRouter: {
        generate: async () => ({
          content: JSON.stringify({
            intents: [{ type: 'refactor', target: 'user-service', confidence: 1, reasoning: 'test' }],
          }),
          provider: 'mock',
        }),
      } as unknown as WorkflowContext['modelRouter'],
    })

    expect(result.status).toBe('completed')
    expect(result.output).toContain('### Known consumers (from impact stage)')
    expect(result.output).toContain('- `packages/ui/src/Button.tsx`')
    expect(result.output).toContain('keep the exports, signatures, and')
  })

  it('task phase turns affected screens and E2E flows into acceptance tasks', async () => {
    const created: TaskInput[] = []
    const pm = {
      name: 'stub',
      createTasks: async (ts: TaskInput[]) => {
        created.push(...ts)
        return ts.map((t, i) => ({ id: String(i + 1), title: t.title, description: t.description, status: 'todo' }))
      },
      updateTasks: async () => {},
      closeTasks: async () => {},
      readTicket: async () => null,
    }
    const result = await taskPhase.run({
      ...makeCtx('Add a profile feature', SAMPLE_REPORT),
      adapters: {
        projectManagement: pm,
      } as unknown as WorkflowContext['adapters'],
    })

    expect(result.status).toBe('completed')
    // One acceptance task per affected screen, naming the generated impact flow.
    const screenTask = created.find(t => t.title === 'Acceptance: ProfileScreen not regressed')
    expect(screenTask).toBeDefined()
    expect(screenTask?.description).toContain('.maestro/profile-screen-impact.yaml')
    // Existing E2E flows referencing an affected screen become a keep-green task.
    const flowsTask = created.find(t => t.title === 'Acceptance: existing E2E flows still pass')
    expect(flowsTask).toBeDefined()
    expect(flowsTask?.description).toContain('`.maestro/profile.yaml`')
  })

  it('task phase adds a consumers-keep-working task for refactors', async () => {
    const created: TaskInput[] = []
    const pm = {
      name: 'stub',
      createTasks: async (ts: TaskInput[]) => {
        created.push(...ts)
        return ts.map((t, i) => ({ id: String(i + 1), title: t.title, description: t.description, status: 'todo' }))
      },
      updateTasks: async () => {},
      closeTasks: async () => {},
      readTicket: async () => null,
    }
    const result = await taskPhase.run({
      ...makeCtx('Refactor user-service', SAMPLE_REPORT),
      modelRouter: {
        generate: async () => ({
          content: JSON.stringify({
            intents: [{ type: 'refactor', target: 'user-service', confidence: 1, reasoning: 'test' }],
          }),
          provider: 'mock',
        }),
      } as unknown as WorkflowContext['modelRouter'],
      adapters: {
        projectManagement: pm,
      } as unknown as WorkflowContext['adapters'],
    })

    expect(result.status).toBe('completed')
    const task = created.find(t => t.title.includes('consumers of user-service keep working'))
    expect(task).toBeDefined()
    expect(task?.description).toContain('`packages/ui/src/Button.tsx`')
  })

  it('writeScreenFlow emits a deterministic regression flow with optional deep link', () => {
    const writer = new MaestroFlowWriter()
    const plain = writer.writeScreenFlow('ProfileScreen', { appId: 'com.app' })
    expect(plain).toContain('appId: "com.app"')
    expect(plain).toContain('- launchApp')
    expect(plain).toContain('- assertVisible: "ProfileScreen"')
    expect(plain).toContain('- takeScreenshot: impact-profile-screen')
    expect(plain).not.toContain('openLink')

    const withLink = writer.writeScreenFlow('ProfileScreen', { appId: 'com.app', deepLink: 'app://profile' })
    expect(withLink).toContain('- openLink: "app://profile"')
    expect(withLink).toContain('- assertVisible: "ProfileScreen"')
  })

  it('test phase writes a Maestro regression flow per affected screen', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'vectalon-impact-e2e-'))
    try {
      const result = await testPhase.run({
        ...makeCtx('Add a profile feature', SAMPLE_REPORT),
        projectRoot,
      })

      expect(result.status).toBe('completed')
      expect(result.output).toContain('## Impact regression flows')
      expect(result.output).toContain('.maestro/profile-screen-impact.yaml')
      expect(result.artifacts.some(a => a.type === 'e2e' && a.path?.includes('profile-screen-impact.yaml'))).toBe(true)

      // The flow file is on disk in .maestro/ and asserts the affected screen.
      const flowPath = join(projectRoot, '.maestro', 'profile-screen-impact.yaml')
      expect(existsSync(flowPath)).toBe(true)
      expect(readFileSync(flowPath, 'utf-8')).toContain('assertVisible: "ProfileScreen"')
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
