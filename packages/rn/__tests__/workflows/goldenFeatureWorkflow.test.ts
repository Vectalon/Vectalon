/**
 * Golden feature-workflow regression suite
 * Business Source License 1.1 (BSL-1.1)
 *
 * The demo (apps/website/demo/login-app + apps/website/demo/cli-app) is a latent
 * golden-test harness: every regression in the feature workflow (resume skipping,
 * template bugs, review hallucination) was found by running it manually. These
 * tests turn that manual replay into deterministic CI coverage using a SCRIPTED
 * model router + dry-run (console) adapters — no model, no network, no simulator.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import {
  runGoldenFeatureWorkflow,
  writeCliScaffold,
  publishPaperTrail,
  type GoldenGenerateKind,
} from '../../src/testing/goldenWorkflow'
import { createTempProject, cleanup } from '../helpers/tmp'

const FEATURE_SCREEN = 'src/screens/AddGreetCommandScreen.tsx'
const FEATURE_HOOK = 'src/hooks/useAddGreetCommand.ts'
const FEATURE_SERVICE = 'src/services/AddGreetCommandApi.ts'

describe('golden feature workflow (CI regression harness)', () => {
  it('replays the full 13-phase workflow green with a scripted model', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      const kinds: GoldenGenerateKind[] = []
      const state = await runGoldenFeatureWorkflow(root, {
        onGenerate: info => kinds.push(info.kind),
      })

      expect(state.status).toBe('completed')
      expect(state.phases).toHaveLength(13)
      expect(state.phases.every(p => p.status === 'completed')).toBe(true)

      // Intent detection, implementation generation, and review all ran; a clean
      // run never needs a fix, so the heal loop must not fire.
      expect(kinds).toContain('intent')
      expect(kinds).toContain('implementation')
      expect(kinds).toContain('review')
      expect(kinds).not.toContain('fix')

      // The scripted implementation matches the TDD test contract, so every
      // generated module is on disk.
      for (const rel of [FEATURE_SCREEN, FEATURE_HOOK, FEATURE_SERVICE]) {
        expect(existsSync(join(root, rel))).toBe(true)
      }

      // Tests were written before implementation (the TDD gate).
      const testsPhase = state.phases.find(p => p.id === 'tests')
      expect(testsPhase?.artifacts.some(a => a.type === 'qa')).toBe(true)

      // Paper trail: committed docs + the gitignored runtime state save.
      expect(existsSync(join(root, 'docs/vectalon/feature-development'))).toBe(true)
      expect(
        existsSync(join(root, '.vectalon/workflows/feature-development', `${state.id}.json`))
      ).toBe(true)
    } finally {
      cleanup(root)
    }
  })

  it('resume skips completed phases instead of re-running them', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      const first = await runGoldenFeatureWorkflow(root)

      // Keep the first 7 phases (prd..implementation) as the completed baseline
      // and resume from code-review onward.
      const partial = { ...first, status: 'pending' as const, phases: first.phases.slice(0, 7) }
      const kinds: GoldenGenerateKind[] = []
      const resumed = await runGoldenFeatureWorkflow(root, {
        state: partial,
        resume: true,
        onGenerate: info => kinds.push(info.kind),
      })

      expect(resumed.status).toBe('completed')
      // The completed implementation phase was skipped — no implementation
      // generation was re-asked. (Intent detection re-runs because the resumed
      // phases re-route for context; review re-runs with the code-review phase.)
      expect(kinds).not.toContain('implementation')
      expect(kinds).toContain('review')

      // Skipped phases kept their original outputs byte-for-byte.
      const kept = resumed.phases.slice(0, 7).map(p => p.output)
      expect(kept).toEqual(first.phases.slice(0, 7).map(p => p.output))
      // And the resumed phases actually completed.
      expect(resumed.phases.slice(7).every(p => p.status === 'completed')).toBe(true)
    } finally {
      cleanup(root)
    }
  })

  it('hallucinated LLM review findings are cleared by code verification', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      // A small model claims `no-any` on code that never uses `any` — the
      // deterministic hallucination guard must clear it and keep the run green.
      const hallucinated = JSON.stringify({
        verdict: 'changes-requested',
        summary: 'The file uses the any type',
        findings: [
          {
            severity: 'error',
            rule: 'no-any',
            message: 'Uses the any type on line 3',
            line: 3,
            suggestion: 'Replace it with a concrete type',
          },
        ],
      })
      const state = await runGoldenFeatureWorkflow(root, { review: () => hallucinated })

      expect(state.status).toBe('completed')
      const reviewPhase = state.phases.find(p => p.id === 'code-review')
      expect(reviewPhase?.status).toBe('completed')
      expect(reviewPhase?.output).toContain('cleared by code verification')
      expect(reviewPhase?.output).not.toContain('Uses the any type on line 3')
    } finally {
      cleanup(root)
    }
  })

  it('falls back to the deterministic scaffold templates when the model is unavailable', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      const state = await runGoldenFeatureWorkflow(root, { useFallbackScaffold: true })

      expect(state.status).toBe('completed')
      const implPhase = state.phases.find(p => p.id === 'implementation')
      expect(implPhase?.status).toBe('completed')
      expect(implPhase?.output).toContain('generic starter scaffold')

      // The React 19 / RNTL v14-aware templates still produce the modules the
      // TDD tests import.
      for (const rel of [FEATURE_SCREEN, FEATURE_HOOK, FEATURE_SERVICE]) {
        expect(existsSync(join(root, rel))).toBe(true)
      }
    } finally {
      cleanup(root)
    }
  })

  it('publishes the committed paper trail (workflow-state + manifest)', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      const state = await runGoldenFeatureWorkflow(root)
      const written = publishPaperTrail(root, state, {
        version: '0.1.0',
        projectName: 'cli-app',
        tooling: 'rn-cli',
        initializedAt: Date.now(),
        modelProvider: 'local',
        autoLearn: true,
        modelConfig: { modelName: 'qwen2.5-coder-3b' },
      })

      expect(written).toHaveLength(2)
      expect(existsSync(join(root, 'docs/vectalon/feature-development', state.id, 'workflow-state.json'))).toBe(true)
      expect(existsSync(join(root, 'docs/vectalon/manifest.json'))).toBe(true)
    } finally {
      cleanup(root)
    }
  })
})
