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
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  runGoldenFeatureWorkflow,
  writeCliScaffold,
  publishPaperTrail,
  GoldenTypeCheckTestRunner,
  scriptedImplementationFiles,
  type GoldenGenerateKind,
} from '../../src/testing/goldenWorkflow'
import { createTempProject, cleanup } from '../helpers/tmp'

const FEATURE_SCREEN = 'src/screens/AddGreetCommandScreen.tsx'
const FEATURE_HOOK = 'src/hooks/useAddGreetCommand.ts'
const FEATURE_SERVICE = 'src/services/AddGreetCommandApi.ts'

describe('golden feature workflow (CI regression harness)', () => {
  it('replays the full 14-phase workflow green with a scripted model', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      const kinds: GoldenGenerateKind[] = []
      const state = await runGoldenFeatureWorkflow(root, {
        onGenerate: info => kinds.push(info.kind),
      })

      expect(state.status).toBe('completed')
      expect(state.phases).toHaveLength(14)
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

      // Keep the first 8 phases (prd..implementation) as the completed baseline
      // and resume from code-review onward.
      const partial = { ...first, status: 'pending' as const, phases: first.phases.slice(0, 8) }
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
      const kept = resumed.phases.slice(0, 8).map(p => p.output)
      expect(kept).toEqual(first.phases.slice(0, 8).map(p => p.output))
      // And the resumed phases actually completed.
      expect(resumed.phases.slice(8).every(p => p.status === 'completed')).toBe(true)
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

  it('compile gate reverts a genuinely breaking model fix (end-to-end)', async () => {
    const root = createTempProject({})
    try {
      writeCliScaffold(root)
      const serviceFile = join(root, 'src/services/AddGreetCommandApi.ts')
      // The service file is generated by the implementation phase (not the
      // scaffold), so the "original" is the scripted implementation content.
      const original =
        scriptedImplementationFiles('add greet command').find(f => f.path === 'src/services/AddGreetCommandApi.ts')
          ?.content || ''
      expect(original).toContain("return 'ok';")

      // The model "fixes" the review finding by introducing a REAL type error
      // (a number assigned to a string) — exactly the hallucinated-corrupt
      // class of fix the compile gate exists to stop. The real TypeScript
      // compiler must catch it and the phase must revert the file.
      const broken = original.replace("return 'ok';", "const broken: string = 42;\n    return 'ok';")
      expect(broken).not.toBe(original)

      const breaking = JSON.stringify({
        verdict: 'changes-requested',
        summary: 'execute() mishandles its result type',
        findings: [
          {
            severity: 'error',
            rule: 'e2e-compile-regression',
            message: 'execute() assigns the wrong type on line 3',
            line: 3,
            suggestion: 'Return the string directly',
          },
        ],
      })
      const approved = JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] })

      const state = await runGoldenFeatureWorkflow(root, {
        // One error-severity finding on the service file only; the other files
        // pass. The rule id is not in LLM_RULE_SIGNALS, so the hallucination
        // filter keeps it (it cannot be verified either way) and the heal loop
        // is forced to attempt a fix.
        review: fileName => (fileName.endsWith('AddGreetCommandApi.ts') ? breaking : approved),
        fix: () => broken,
        testRunner: new GoldenTypeCheckTestRunner(root),
      })

      // The finding is error-severity and the model's only fix breaks the
      // build, so the phase honestly fails — but the gate stopped the bad fix
      // from ever reaching the working tree.
      expect(state.status).toBe('failed')
      const reviewPhase = state.phases.find(p => p.id === 'code-review')
      expect(reviewPhase?.status).toBe('failed')

      const output = reviewPhase?.output || ''
      // The gate log proves a before → after count transition and the revert.
      // The counts are matched loosely (not pinned to 0 → 1) so a future
      // compiler version adding a second diagnostic for the same construct
      // does not false-fail the gate test.
      expect(output).toMatch(/fix rejected by compile gate \(\d+ → \d+ type error\(s\)\)/)
      expect(output).toContain('reverted')

      // The on-disk file is the original clean implementation, not the fix.
      expect(readFileSync(serviceFile, 'utf-8')).toBe(original)
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
