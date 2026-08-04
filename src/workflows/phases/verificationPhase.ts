import { existsSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import type { WorkflowPhase } from '../../adapters/types'
import { runCommand } from '../../adapters/runCommand'
import { detectValidationCommands } from '../../utils/validationCommands'
import { findSourceFiles } from '../../utils/unusedImports'
import { phaseResult, failedPhase } from './helpers'
import { getIntent, isRemoveDependency, isRefactor, isFix } from './intent'
import { referenceTokens } from './implementationPhase'
import { scanNativeReferences, scanDeadNativeConfig, isRemoveUnusedNativeConfigTarget } from '../../utils/nativeScan'

function isCommentLine(line: string): boolean {
  return /^(?:\/\/|\*|\/\*|#)/.test(line)
}

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
    if (isRemoveDependency(intent)) {
      // Live check — re-read package.json from disk, because the scan snapshot
      // was captured BEFORE the implementation phase ran (and edited it).
      const pkgPath = ctx.projectRoot ? join(ctx.projectRoot, 'package.json') : undefined
      let stillInstalled = false
      let note = ''
      let scanned = false
      if (pkgPath && existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
            dependencies?: Record<string, string>
            devDependencies?: Record<string, string>
          }
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
          stillInstalled = Object.keys(deps).some(name =>
            name.toLowerCase().includes(intent.dependency.toLowerCase())
          )
          scanned = true
        } catch (err) {
          note = ` (could not read package.json: ${err instanceof Error ? err.message : String(err)})`
        }
      }
      if (!scanned && !note && ctx.snapshot) {
        // No manifest on disk — fall back to the scan-time snapshot.
        const deps = { ...ctx.snapshot.project.dependencies, ...ctx.snapshot.project.devDependencies }
        stillInstalled = Object.keys(deps).some(name =>
          name.toLowerCase().includes(intent.dependency.toLowerCase())
        )
        note = ' (no package.json found; checked scan-time snapshot)'
      }
      results.push(`- Dependency check: ${stillInstalled ? 'FAIL — package still in package.json' : 'pass — no matching package in package.json'}${note}`)
      if (stillInstalled) allPassed = false

      // Import + reference scan — a "safe" removal means no source file still
      // imports the package AND no code still calls it at runtime.
      const srcDir = ctx.projectRoot ? join(ctx.projectRoot, 'src') : undefined
      const remainingImports: string[] = []
      const remainingUsages: { file: string; line: number }[] = []
      if (srcDir && existsSync(srcDir)) {
        const escaped = intent.dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const importRe = new RegExp(`(?:from\\s+|import\\s*\\(\\s*|require\\(\\s*)['"]${escaped}(?:\\/[^'"]+)?['"]`, 'i')
        const tokens = referenceTokens(intent.dependency, [])
        for (const file of findSourceFiles(srcDir)) {
          const rel = relative(ctx.projectRoot, file)
          readFileSync(file, 'utf-8').split('\n').forEach((line, idx) => {
            const trimmed = line.trim()
            if (!trimmed || isCommentLine(trimmed)) return
            if (importRe.test(line)) {
              remainingImports.push(`${rel}:${idx + 1}`)
            } else if (tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(line))) {
              remainingUsages.push({ file: rel, line: idx + 1 })
            }
          })
        }
      }
      if (remainingImports.length > 0) {
        results.push(`- Import scan: FAIL — ${remainingImports.length} line(s) still import "${intent.dependency}": ${remainingImports.slice(0, 10).join(', ')}`)
        allPassed = false
      } else if (srcDir && existsSync(srcDir)) {
        results.push('- Import scan: pass — no source imports of the removed package remain')
      } else {
        results.push('- Import scan: skipped (no src/ directory)')
      }
      if (remainingUsages.length > 0) {
        results.push(`- Reference scan: FAIL — ${remainingUsages.length} line(s) still call or reference "${intent.dependency}" (e.g. ${remainingUsages[0].file}:${remainingUsages[0].line}). Removing the package is not safe until these are resolved.`)
        allPassed = false
      } else if (srcDir && existsSync(srcDir)) {
        results.push('- Reference scan: pass — no non-import usages of the removed package remain')
      } else {
        results.push('- Reference scan: skipped (no src/ directory)')
      }

      // Native scan — the iOS/Android side of a safe removal: pods, gradle
      // includes/deps, native imports, manifest/plist/pbxproj entries. Podfile.lock
      // is regenerated by `pod install` and its stale entries don't block the run.
      if (ctx.projectRoot) {
        const nativeRefs = scanNativeReferences(ctx.projectRoot, [intent.dependency]).filter(r => r.kind !== 'pod-lock')
        if (nativeRefs.length > 0) {
          const sample = nativeRefs.slice(0, 10).map(r => `${r.platform} ${r.file}:${r.line} (${r.kind})`).join(', ')
          results.push(`- Native scan: FAIL — ${nativeRefs.length} native reference(s) remain in ios/ and android/ (${sample}). Removing the package is not safe until the native side is updated.`)
          allPassed = false
        } else {
          results.push('- Native scan: pass — no iOS/Android references to the removed package remain')
        }
      } else {
        results.push('- Native scan: skipped (no project root)')
      }
    }

    // Dead native config scan — advisory only (never gates): a "remove unused
    // native config" refactor reports candidate dead pods/gradle deps/imports so
    // the user can review them before deleting anything.
    if (isRefactor(intent) && isRemoveUnusedNativeConfigTarget(intent.target) && ctx.projectRoot) {
      const deadScan = scanDeadNativeConfig(ctx.projectRoot)
      if (deadScan.findings.length > 0) {
        const sample = deadScan.findings.slice(0, 5).map(f => `${f.platform} ${f.file}:${f.line} (${f.kind})`).join(', ')
        results.push(`- Dead native config scan: ${deadScan.findings.length} candidate(s) (advisory — nothing deleted): ${sample}`)
      } else {
        results.push('- Dead native config scan: pass — no candidate dead pods/gradle deps/imports found')
      }
    }

    // Validate that tests exist for the new implementation. The engine appends a
    // document artifact to every phase, so filter for actual qa test artifacts.
    const testPhase = ctx.state.phases.find(p => p.id === 'tests')
    const implementationPhase = ctx.state.phases.find(p => p.id === 'implementation')
    const hasTests = !!testPhase && testPhase.artifacts.some(a => a.type === 'qa')
    const hasImplementation = !!implementationPhase && implementationPhase.artifacts.length > 0

    // Unknown requests produce a clarification plan (never new code), and
    // testPhase explicitly skips generation for them — so the TDD gate must not
    // fail the run for a missing scaffold that was never supposed to exist.
    if (isRemoveDependency(intent) || isRefactor(intent) || isFix(intent) || intent.type === 'unknown') {
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
