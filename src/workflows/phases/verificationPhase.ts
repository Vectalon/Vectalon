import type { WorkflowPhase } from '../../adapters/types'
import { runCommand } from '../../adapters/runCommand'
import { detectValidationCommands } from '../../utils/validationCommands'
import { phaseResult, failedPhase } from './helpers'
import { getIntent, isRemoveDependency, isRefactor, isFix } from './intent'

function formatOutput(stdout: string, stderr: string, limit = 4000): string {
  const out = stdout.trim()
  const err = stderr.trim()
  const parts: string[] = []
  if (err) {
    parts.push('**stderr**')
    parts.push('```')
    parts.push(err.length > limit ? err.slice(0, limit) + '\n... (truncated)' : err)
    parts.push('```')
  }
  if (out) {
    parts.push('**stdout**')
    parts.push('```')
    parts.push(out.length > limit ? out.slice(0, limit) + '\n... (truncated)' : out)
    parts.push('```')
  }
  return parts.length > 0 ? '\n' + parts.join('\n') : ''
}

export const verificationPhase: WorkflowPhase = {
  id: 'verification',
  name: 'Verification',
  description: 'Run lint, type check, tests, prettier, and native build checks. Validates TDD and code review gates before PR.',
  run: async (ctx) => {
    const testRunner = ctx.adapters.testRunner
    const isSimulated = testRunner.name === 'console'
    const results: string[] = []
    let allPassed = true

    const validation = detectValidationCommands(ctx.projectRoot, { deviceRun: ctx.deviceRun })

    const runCheck = async (name: string, promise: Promise<import('../../adapters/types').TestResult>) => {
      try {
        const result = await promise
        const status = result.success ? 'passed' : 'failed'
        results.push(`- ${name}: ${status}${isSimulated ? ' (simulated)' : ` (exit ${result.exitCode})`}${formatOutput(result.stdout, result.stderr)}`)
        if (!result.success) {
          allPassed = false
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(`- ${name}: error — ${message}`)
        allPassed = false
      }
    }

    // Always run tests, lint, prettier, and type check if scripts are available
    if (testRunner.runTests) {
      await runCheck('Tests', testRunner.runTests())
    }

    if (testRunner.runLint) {
      await runCheck('Lint', testRunner.runLint())
    }

    if (testRunner.runPrettier) {
      await runCheck('Prettier', testRunner.runPrettier())
    }

    if (testRunner.runTypeCheck) {
      await runCheck('Type check', testRunner.runTypeCheck())
    }

    // Run native/CLI validation commands detected from package.json and project structure
    for (const cmd of validation.commands) {
      if (isSimulated) {
        results.push(`- ${cmd.name}: skipped (simulated)`)
        continue
      }
      try {
        const result = await runCommand(cmd.cmd, cmd.args, { cwd: cmd.cwd || ctx.projectRoot, timeout: cmd.timeout })
        const status = result.success ? 'passed' : 'failed'
        results.push(`- ${cmd.name}: ${status} (${cmd.source}, exit ${result.exitCode})${formatOutput(result.stdout, result.stderr)}`)
        if (!result.success) {
          allPassed = false
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(`- ${cmd.name}: error — ${message}`)
        allPassed = false
      }
    }

    const intent = (await getIntent(ctx)).intent
    if (isRemoveDependency(intent) && ctx.snapshot) {
      const deps = { ...ctx.snapshot.project.dependencies, ...ctx.snapshot.project.devDependencies }
      const stillInstalled = Object.keys(deps).some(name =>
        name.toLowerCase().includes(intent.dependency.toLowerCase())
      )
      results.push(`- Dependency check: ${stillInstalled ? 'FAIL — package still in package.json' : 'pass — no matching package in package.json'}`)
      if (stillInstalled) allPassed = false
    }

    // Validate that tests exist for the new implementation. The engine appends a
    // document artifact to every phase, so filter for actual qa test artifacts.
    const testPhase = ctx.state.phases.find(p => p.id === 'tests')
    const implementationPhase = ctx.state.phases.find(p => p.id === 'implementation')
    const hasTests = !!testPhase && testPhase.artifacts.some(a => a.type === 'qa')
    const hasImplementation = !!implementationPhase && implementationPhase.artifacts.length > 0

    if (isRemoveDependency(intent) || isRefactor(intent) || isFix(intent)) {
      results.push('- TDD validation: skipped (no new scaffold tests required for this intent)')
    } else if (hasImplementation && !hasTests) {
      results.push('- TDD validation: FAIL — no tests were written before implementation')
      allPassed = false
    } else if (hasTests && hasImplementation) {
      results.push('- TDD validation: pass — tests written before implementation')
    }

    // Validate that code review passed
    const codeReviewPhase = ctx.state.phases.find(p => p.id === 'code-review')
    if (codeReviewPhase) {
      if (codeReviewPhase.status === 'completed') {
        results.push('- Code review: pass — no critical issues found')
      } else {
        results.push('- Code review: FAIL — critical issues must be fixed before PR')
        allPassed = false
      }
    }

    const output = [
      '# Verification report',
      '',
      isSimulated
        ? '⚠️  Running in simulation mode. No actual test commands were executed. Configure a real test runner to enable live verification.'
        : `Detected ${validation.commands.length} validation command(s) from package.json scripts and React Native CLI project structure.`,
      '',
      ...results,
      '',
      allPassed
        ? 'All checks passed. Feature is ready for review.'
        : 'Some checks failed. Review the command output above.',
    ].join('\n')

    const status = allPassed ? 'completed' : 'failed'
    if (status === 'completed') {
      return phaseResult(
        'verification',
        'Verification',
        'Run lint, type check, tests, prettier, and native build checks. Validates TDD and code review gates before PR.',
        output,
        [{ type: 'qa', title: `Verification: ${ctx.prompt}`, content: output }]
      )
    }

    return failedPhase(
      'verification',
      'Verification',
      'Run lint, type check, tests, prettier, and native build checks. Validates TDD and code review gates before PR.',
      output
    )
  },
}
