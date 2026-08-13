import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs'
import { join, relative } from 'path'
import type { WorkflowPhase, WorkflowArtifact, WorkflowContext } from '../../adapters/types'
import { runCommand } from '../../adapters/runCommand'
import { DeviceController } from '../../adapters/deviceControl'
import { detectValidationCommands } from '../../utils/validationCommands'
import { ReferenceStore } from '../../utils/referenceStore'
import { diffImages, type VisualFinding } from '../../utils/visualDiff'
import { detectUrlScheme, buildDeepLink, deriveScreenFromImplementation, kebabCase } from '../../utils/deepLink'
import { findSourceFiles } from '../../utils/unusedImports'
import { phaseResult, failedPhase } from './helpers'
import { reportError } from '../../utils/safe'
import { getIntent, isRemoveDependency, isRefactor, isFix } from './intent'
import { referenceTokens } from './implementationPhase'
import { scanNativeReferences, scanDeadNativeConfig, isRemoveUnusedNativeConfigTarget } from '../../utils/nativeScan'

function isCommentLine(line: string): boolean {
  return /^(?:\/\/|\*|\/\*|#)/.test(line)
}

interface VisualCheckInput {
  /** Screen name to deep-link to (e.g. `LoginScreen`); default: derived from the implementation phase. */
  screen?: string
  /** Full deep link to open; overrides the scheme+screen default. */
  deepLink?: string
  /** Reference-store key to diff against; default: kebab-case screen name or the newest reference. */
  reference?: string
  /** Save the captured screenshot as the reference for this run instead of diffing. */
  captureReference?: boolean
  /** Pixel-diff drift threshold (0-1); default 0.03. */
  diffThreshold?: number
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

interface VisualVerificationOutcome {
  screenshot: { rel: string } | null
  findings: VisualFinding[]
}

/**
 * Boot (or reuse) a device, deep-link to the new screen, capture a screenshot,
 * and diff it against the stored reference. Advisory only — every failure path
 * reports a skip line and returns, never throws, and never gates the workflow.
 */
async function runVisualVerification(
  ctx: WorkflowContext,
  input: boolean | VisualCheckInput | undefined,
  results: string[]
): Promise<VisualVerificationOutcome> {
  const outcome: VisualVerificationOutcome = { screenshot: null, findings: [] }
  const root = ctx.projectRoot
  const opts: VisualCheckInput = input === true || input === undefined || input === false ? {} : input
  const store = new ReferenceStore(root)

  try {
    const controller = new DeviceController(root)
    const listing = await controller.listDevices()
    const hasBooted = listing.success && listing.stdout.trim().length > 0
    const boot = hasBooted ? null : await controller.boot()
    if (boot && !boot.success) {
      results.push(`- Visual check: skipped — could not boot a ${controller.platform} device (${(boot.stderr || boot.stdout).slice(0, 200)}). Screenshots need a running simulator/emulator.`)
      return outcome
    }

    // Deep-link to the new screen when we can identify one.
    const screen = opts.screen || deriveScreenFromImplementation(ctx.state.phases)
    const scheme = detectUrlScheme(root)
    const deepLink = opts.deepLink || (screen && scheme ? buildDeepLink(scheme, screen) : null)
    if (deepLink) {
      const opened = await controller.openUrl(deepLink)
      if (opened.success) {
        // Give the JS bundle a moment to render the screen before capturing.
        await new Promise(r => setTimeout(r, 1500))
        results.push(`- Visual check: opened deep link \`${deepLink}\`${screen ? ` (${screen})` : ''}`)
      } else {
        results.push(`- Visual check: deep link \`${deepLink}\` failed to open (${(opened.stderr || opened.stdout).slice(0, 200)}) — capturing anyway`)
      }
    }

    const shotDir = join(root, '.vectalon', 'artifacts', 'screenshots')
    mkdirSync(shotDir, { recursive: true })
    const shotPath = join(shotDir, `visual-${controller.platform}-${Date.now()}.png`)
    const shot = await controller.screenshot(shotPath)
    if (!shot.success) {
      results.push(`- Visual check: skipped — screenshot failed (${(shot.stderr || shot.stdout).slice(0, 200)})`)
      return outcome
    }
    outcome.screenshot = { rel: relative(root, shotPath) }

    // Capture a baseline instead of diffing when asked.
    const referenceKey = opts.reference || (screen ? kebabCase(screen) : null)
    if (opts.captureReference && referenceKey) {
      const saved = store.save(referenceKey, shotPath, {
        platform: controller.platform,
        source: 'verification baseline',
        capturedAt: Date.now(),
      })
      if (saved) {
        results.push(`- Visual check: reference captured for \`${referenceKey}\` — future runs will diff against it`)
      } else {
        results.push('- Visual check: could not capture reference (invalid key or missing screenshot)')
      }
      return outcome
    }

    // A requested key that does not exist is a misconfiguration — never fall
    // back to the newest reference for a *different* screen and diff against
    // the wrong baseline. Only fall back to newest when no key was requested.
    let reference = referenceKey ? store.get(referenceKey) : null
    if (!reference && referenceKey) {
      results.push(`- Visual check: screenshot captured to \`.vectalon/artifacts/screenshots/${outcome.screenshot.rel}\` — no stored reference for \`${referenceKey}\`. Capture a baseline with \`visual_capture_reference\` (MCP) or pass \`visualCheck.captureReference\` on the next run.`)
      return outcome
    }
    if (!reference) reference = store.latest(controller.platform)
    if (!reference) {
      results.push(`- Visual check: screenshot captured to \`.vectalon/artifacts/screenshots/${outcome.screenshot.rel}\` — no stored reference to diff against. Capture a baseline with \`visual_capture_reference\` (MCP) or pass \`visualCheck.captureReference\` on the next run.`)
      return outcome
    }

    const diff = diffImages(
      reference.path,
      shotPath,
      opts.diffThreshold !== undefined ? { driftThreshold: opts.diffThreshold } : undefined
    )
    outcome.findings = diff.findings
    const pct = (diff.diffRatio * 100).toFixed(2)
    if (diff.findings.length === 0) {
      results.push(`- Visual diff: pass — screenshot matches reference \`${reference.key}\` (${pct}% of pixels differ)`)
    } else {
      results.push(`- Visual diff: ${diff.findings.length} finding(s) vs reference \`${reference.key}\` (${pct}% of pixels differ) — UI regression candidates:`)
      for (const f of diff.findings) {
        const region = f.region ? ` @(${f.region.x},${f.region.y},${f.region.width}×${f.region.height})` : ''
        results.push(`  - [${f.severity}] ${f.rule}: ${f.message}${region}`)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    results.push(`- Visual check: skipped — ${message}`)
  }
  return outcome
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
    let advisoryDowngrades = 0

    // Workflow-touched files: the implementation phase's artifacts. A failing
    // check whose output references none of them is a PRE-EXISTING project
    // failure — downgraded to advisory (never gates) unless the run is strict.
    const implPhase = ctx.state.phases.find(p => p.id === 'implementation')
    const touchedFiles = (implPhase?.artifacts ?? [])
      .map(a => a.path)
      .filter((p): p is string => Boolean(p))
      .map(p => (ctx.projectRoot && p.startsWith(ctx.projectRoot) ? p.slice(ctx.projectRoot.length + 1) : p))
    const strictVerification =
      (ctx.inputs as { strictVerification?: boolean } | undefined)?.strictVerification === true

    const outputReferencesTouched = (output: string): boolean => {
      if (touchedFiles.length === 0) return false
      return touchedFiles.some(rel => {
        if (output.includes(rel)) return true
        const base = rel.split('/').pop() || rel
        return base.length > 3 && output.includes(base)
      })
    }

    const validation = detectValidationCommands(ctx.projectRoot, { deviceRun: ctx.deviceRun })

    const runCheck = async (name: string, promise: Promise<import('../../adapters/types').TestResult>) => {
      try {
        const result = await promise
        // Pre-existing project failures (nothing the workflow touched appears
        // in the output) are advisory unless the run is strict — "ignore
        // existing failures unless specifically asked."
        const preExisting =
          !result.success && !strictVerification && !outputReferencesTouched(result.stderr + '\n' + result.stdout)
        const status = result.success ? 'passed' : 'failed'
        results.push(
          `- ${name}: ${status}${isSimulated ? ' (simulated)' : ` (exit ${result.exitCode})`}` +
            (preExisting ? ' — pre-existing, unrelated to this change (advisory)' : '') +
            formatOutput(result.stdout, result.stderr)
        )
        if (preExisting) {
          advisoryDowngrades++
        } else if (!result.success) {
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
        const preExisting =
          !result.success && !strictVerification && !outputReferencesTouched(result.stdout + '\n' + result.stderr)
        const status = result.success ? 'passed' : 'failed'
        results.push(
          `- ${cmd.name}: ${status} (${cmd.source}, exit ${result.exitCode})` +
            (preExisting ? ' — pre-existing, unrelated to this change (advisory)' : '') +
            formatOutput(result.stdout, result.stderr)
        )
        if (preExisting) {
          advisoryDowngrades++
        } else if (!result.success) {
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

    // Maestro E2E — run any flows the test phase generated (advisory: E2E is
    // slow and flaky, so it reports but never gates the workflow). Requires the
    // maestro CLI on PATH and a booted device; otherwise it explains how to run
    // the flows locally.
    if (ctx.projectRoot) {
      const flowsDir = join(ctx.projectRoot, '.maestro')
      let flows: string[] = []
      try {
        flows = existsSync(flowsDir)
          ? readdirSync(flowsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
          : []
      } catch (err) {
        reportError(err, 'verification: listing maestro flows')
        flows = []
      }
      if (flows.length > 0) {
        const maestroProbe = await runCommand('maestro', ['--version'], { cwd: ctx.projectRoot, timeout: 10000 })
        if (!maestroProbe.success) {
          results.push(`- Maestro E2E: skipped — maestro CLI not found on PATH (generated ${flows.length} flow(s) in .maestro/; install with \`curl -Ls "https://get.maestro.mobile.dev" | bash\`)`)
        } else if (isSimulated) {
          // A dry-run workflow must never actually execute E2E tests.
          results.push(`- Maestro E2E: skipped (simulated) — ${flows.length} flow(s) in .maestro/ ready for \`maestro test\``)
        } else {
          // Check BOTH platforms: a booted iOS simulator OR Android emulator
          // qualifies (maestro targets whichever device is running).
          const iosController = new DeviceController(ctx.projectRoot, { platform: 'ios' })
          const androidController = new DeviceController(ctx.projectRoot, { platform: 'android' })
          const [iosBooted, androidBooted] = await Promise.all([
            iosController.listDevices(),
            androidController.listDevices(),
          ])
          const hasDevice =
            (iosBooted.success && iosBooted.stdout.trim().length > 0) ||
            (androidBooted.success && androidBooted.stdout.trim().length > 0)
          if (!hasDevice) {
            results.push(`- Maestro E2E: skipped — no booted device detected (${flows.length} flow(s) in .maestro/). Boot one with \`vectalon serve\` device tools or \`xcrun simctl boot\` / \`emulator -avd <name>\`.)`)
          } else {
            try {
              const e2e = await runCommand('maestro', ['test', flowsDir, '--format', 'junit'], {
                cwd: ctx.projectRoot,
                timeout: 15 * 60 * 1000,
              })
              const reportNote = e2e.success
                ? ' — screenshots/report in ./maestro-report/ (attach to the PR)'
                : ''
              results.push(`- Maestro E2E: ${e2e.success ? 'pass' : 'failed'} — ${flows.length} flow(s) executed${reportNote}${formatOutput(e2e.stdout, e2e.stderr, 2000)}`)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              results.push(`- Maestro E2E: error — ${message}`)
            }
          }
        }
      }
    }

    // Visual verification loop — boot a simulator/emulator (or reuse one already
    // booted), deep-link to the new screen, capture a screenshot into
    // .vectalon/artifacts/screenshots/, diff it against a stored reference, and
    // surface UI regressions as annotated findings in the phase output + a
    // design artifact for the PR. Advisory: device boot is slow and often
    // unavailable in CI, so this reports but never gates the workflow. Skipped
    // for simulated runs, test runs, and explicit `visualCheck: false`.
    let visualScreenshot: { rel: string } | null = null
    let visualFindings: VisualFinding[] = []
    // Only attempt on a real RN project (native dirs present) — a Node package
    // without ios//android/ must never boot a simulator on the developer machine.
    const hasNativeDirs =
      Boolean(ctx.projectRoot) &&
      (existsSync(join(ctx.projectRoot, 'ios')) || existsSync(join(ctx.projectRoot, 'android')))
    const visualInput = (ctx.inputs as { visualCheck?: boolean | VisualCheckInput } | undefined)?.visualCheck
    if (hasNativeDirs && !isSimulated && process.env.NODE_ENV !== 'test' && visualInput !== false) {
      const outcome = await runVisualVerification(ctx, visualInput, results)
      visualScreenshot = outcome.screenshot
      visualFindings = outcome.findings
    } else {
      results.push('- Visual check: skipped (simulated/test run) — boot a simulator/emulator and run `vectalon serve` device tools to capture screenshots')
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

    if (advisoryDowngrades > 0) {
      results.push(
        `- Advisory: ${advisoryDowngrades} pre-existing failure(s) unrelated to this change were ignored (they reference no file this workflow touched). Re-run with strictVerification to gate on them.`
      )
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
      const artifacts: WorkflowArtifact[] = [{ type: 'qa', title: `Verification: ${ctx.prompt}`, content: output }]
      if (visualScreenshot) {
        artifacts.push({
          type: 'design',
          title: 'Visual verification screenshot',
          content: `Screenshot captured during verification:\n\n- \`${visualScreenshot.rel}\` (attach to the PR)`,
          path: visualScreenshot.rel,
        })
      }
      if (visualFindings.length > 0) {
        artifacts.push({
          type: 'design',
          title: `Visual diff findings: ${ctx.prompt}`,
          content: [
            `Annotated UI regression findings from diffing the captured screenshot against the reference:`, '',
            '| Severity | Rule | Detail |',
            '|---|---|---|',
            ...visualFindings.map(f => {
              const region = f.region ? ` @(${f.region.x},${f.region.y},${f.region.width}×${f.region.height})` : ''
              return `| ${f.severity} | ${f.rule} | ${f.message.replace(/\n/g, ' ')}${region} |`
            }),
          ].join('\n'),
        })
      }
      return phaseResult(
        'verification',
        'Verification',
        'Run lint, type check, tests, prettier, and native build checks. Validates TDD and code review gates before PR.',
        output,
        artifacts
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
