import type { WorkflowPhase } from '../../adapters/types'
import { phaseResult, failedPhase } from './helpers'
import { detectIntent, isRemoveDependency } from './intent'

export const verificationPhase: WorkflowPhase = {
  id: 'verification',
  name: 'Verification',
  description: 'Run lint, type check, tests, and optional simulator checks.',
  run: async (ctx) => {
    const testRunner = ctx.adapters.testRunner
    const isSimulated = testRunner.name === 'console'
    const results: string[] = []
    let allPassed = true

    const runCheck = async (name: string, promise: Promise<import('../../adapters/types').TestResult>) => {
      try {
        const result = await promise
        const status = result.success ? 'passed' : 'failed'
        results.push(`- ${name}: ${status}${isSimulated ? ' (simulated)' : ` (${result.exitCode})`}`)
        if (!result.success) {
          allPassed = false
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(`- ${name}: error — ${message}`)
        allPassed = false
      }
    }

    await runCheck('Tests', testRunner.runTests())

    if (testRunner.runLint) {
      await runCheck('Lint', testRunner.runLint())
    }

    if (testRunner.runTypeCheck) {
      await runCheck('Type check', testRunner.runTypeCheck())
    }

    if (allPassed) {
      try {
        const iosResult = await ctx.adapters.simulator.run({ platform: 'ios', build: true })
        results.push(`- iOS simulator: ${iosResult.success ? 'passed' : 'failed'}${isSimulated ? ' (simulated)' : ''}`)
        if (!iosResult.success) allPassed = false
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(`- iOS simulator: skipped — ${message}`)
      }
    }

    const intent = detectIntent(ctx.prompt)
    if (isRemoveDependency(intent) && ctx.snapshot) {
      const deps = { ...ctx.snapshot.project.dependencies, ...ctx.snapshot.project.devDependencies }
      const stillInstalled = Object.keys(deps).some(name =>
        name.toLowerCase().includes(intent.dependency.toLowerCase())
      )
      results.push(`- Dependency check: ${stillInstalled ? 'FAIL — package still in package.json' : 'pass — no matching package in package.json'}`)
      if (stillInstalled) allPassed = false
    }

    const output = [
      '# Verification report',
      '',
      isSimulated
        ? '⚠️  Running in simulation mode. No actual test commands were executed. Configure a real test runner to enable live verification.'
        : 'Running with configured test/simulator adapters.',
      '',
      ...results,
      '',
      allPassed
        ? 'All checks passed. Feature is ready for review.'
        : 'Some checks failed. Review the output above.',
    ].join('\n')

    const status = allPassed ? 'completed' : 'failed'
    if (status === 'completed') {
      return phaseResult(
        'verification',
        'Verification',
        'Run lint, type check, tests, and optional simulator checks.',
        output,
        [{ type: 'qa', title: `Verification: ${ctx.prompt}`, content: output }]
      )
    }

    return failedPhase(
      'verification',
      'Verification',
      'Run lint, type check, tests, and optional simulator checks.',
      output
    )
  },
}
