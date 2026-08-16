import { writeFileSync } from 'fs'
import { logger } from '../logger'
import { ModelRouter } from '../../model/ModelRouter'
import type { ModelProviderType } from '../../model/types'
import { isModelSetupProvider, MODEL_PROVIDERS } from '../../model/setup'
import { runBenchmarkFromDir } from '../../bench/runner'
import { createModelGenerate } from '../../bench/modelGenerate'
import { formatBenchmarkReport, formatScenarioSection, formatBenchmarkOverall } from '../../bench/report'
import { defaultScenariosDir } from '../../bench/loader'
import { DEFAULT_BASELINE_TOLERANCE, loadBaselineFile, compareToBaseline, formatBaselineComparison, gateBenchRelease } from '../../bench/baseline'
import { resolvePresetValue, getPreset, listUsagePresets, listPresets, autoSelectModelId } from '../../model/local/presets'
import { SCENARIO_SPEC_VERSION } from '../../bench/types'
import type { BenchGeneratedFile, BenchScenario, BenchSummary } from '../../bench/types'
import { createTokenPreviewSink } from '../tokenPreview'
import { totalmem } from 'os'

/** Total system RAM in GB — the input to the preset auto-selector. */
function osTotalRamGb(): number {
  return totalmem() / 1024 / 1024 / 1024
}

export interface BenchCommandOptions {
  /** Model provider (local/openai/anthropic); runs the real-model leaderboard pass. */
  model?: string
  /**
   * Local model preset for a `--model local` pass: a usage tier
   * (fast|balanced|quality) or a model preset id (qwen2.5-coder-3b / …-7b).
   * Defaults to the preset auto-selected for this machine's RAM.
   */
  preset?: string
  /** Only run scenarios in this suite. */
  suite?: string
  /** Run real tests/typecheck/lint for correctness scoring (slow). */
  live?: boolean
  /** Run `npm install` in each temp project before live correctness checks. */
  install?: boolean
  /** Print the summary as JSON instead of markdown. */
  json?: boolean
  /** Write the report to a file instead of stdout. */
  output?: string
  /** Override the scenarios directory (default: bench/scenarios). */
  scenarios?: string
  /** Override the human reference-solutions directory (default: bench/references). */
  references?: string
  /** Compare the deterministic run against a stored baseline JSON (M4 CI gate). */
  baseline?: string
  /** Max allowed axis drop (fraction) before a regression is flagged (default 0.01). */
  tolerance?: number
}

export async function benchCommand(options: BenchCommandOptions): Promise<void> {
  if (options.model && !isModelSetupProvider(options.model)) {
    logger.error(`Unknown model provider: ${options.model}`)
    logger.info(`Available providers: ${MODEL_PROVIDERS.join(', ')}`)
    process.exit(1)
  }

  if (options.baseline && options.model) {
    logger.error('--baseline compares the deterministic baseline only; drop --model for a regression gate')
    process.exit(1)
  }

  if (options.install && !options.live) {
    logger.warn('--install has no effect without --live (it installs deps before live correctness checks)')
  }

  // --preset selects the local GGUF model a `--model local` pass runs. It is
  // meaningless for remote providers (they name their own model) and for the
  // deterministic baseline — reject those combinations up front.
  if (options.preset) {
    if (!options.model) {
      logger.error('--preset selects a local model; pass --model local (e.g. `bench --model local --preset balanced`)')
      process.exit(1)
    }
    if (options.model !== 'local') {
      logger.error(`--preset only applies to --model local (got --model ${options.model}); remote providers name their own model`)
      process.exit(1)
    }
    if (!resolvePresetValue(options.preset)) {
      logger.error(`Unknown preset: ${options.preset}`)
      logger.info(`Usage tiers: ${listUsagePresets().map(p => `${p.id} (${p.modelId})`).join(', ')}`)
      logger.info(`Model presets: ${listPresets().map(p => p.id).join(', ')}`)
      process.exit(1)
    }
  }

  const tolerance = options.tolerance ?? DEFAULT_BASELINE_TOLERANCE
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    logger.error(`Invalid tolerance: ${String(options.tolerance)}`)
    process.exit(1)
  }

  const baseline = options.baseline ? loadBaselineFile(options.baseline) : null
  if (options.baseline && !baseline) {
    logger.error(`Could not load baseline file: ${options.baseline}`)
    logger.info('Generate one with: npx vectalon bench --json -o bench/baseline.json')
    process.exit(1)
  }

  // Live streaming: only when the report itself goes to stdout (not --json,
  // not --output), so a leaderboard pass rolls in as it runs. The preview
  // sink is TTY-only and off for --json so structured/CI output stays clean.
  const streamReport = !options.json && !options.output
  const preview = createTokenPreviewSink(!options.json && Boolean(process.stderr.isTTY))

  let modelRouter: ModelRouter | undefined
  let generate: ((scenario: BenchScenario) => Promise<BenchGeneratedFile[]>) | undefined
  if (options.model) {
    // --preset (or the RAM auto-select) names the local GGUF model the pass
    // measures. Resolved to a concrete model preset id and threaded through
    // modelConfig.modelName — the same knob the project manifest uses.
    let modelName: string | undefined
    if (options.model === 'local') {
      const resolved = resolvePresetValue(options.preset) || getPreset(autoSelectModelId(osTotalRamGb()))
      modelName = resolved ? resolved.id : undefined
    }
    const modelLabel = modelName || options.model
    logger.info(`Running leaderboard pass with model provider: ${modelLabel}`)
    // An explicit --model disables the zero-config WASM auto-tier so a `--model
    // local` pass measures the GGUF model (or the deterministic stub when none
    // is downloaded) instead of silently swapping in the WASM model.
    modelRouter = new ModelRouter({ zeroConfigEnabled: options.model ? false : undefined })
    modelRouter.initialize({ provider: options.model as ModelProviderType, modelName })
    // Build the model seam here (not in the runner) so the live token preview
    // can be wired straight into the generate call.
    generate = createModelGenerate({ modelRouter, onTextChunk: preview.push })
  }

  let lastSuite: string | null = null
  let headerPrinted = false
  const { summary, problems, referenceProblems } = await runBenchmarkFromDir({
    generate,
    live: options.live,
    install: options.install,
    filter: options.suite ? { suite: options.suite } : undefined,
    scenariosDir: options.scenarios,
    referencesDir: options.references,
    onScenarioStart: ({ index, total, scenario }) => {
      // Print the report header up front so the streamed sections read as a
      // real report rather than floating fragments.
      if (streamReport && !headerPrinted) {
        headerPrinted = true
        logger.out(`# RN Coding Tests — Benchmark report\n\nSpec version: ${SCENARIO_SPEC_VERSION} · ${total} scenario(s) run\n\n`)
      }
      // The first generation loads the GGUF and initializes the engine — say
      // so right where the pause actually is, instead of a blank terminal.
      if (index === 1 && options.model) {
        logger.dim('Loading model engine (first scenario warms it; later scenarios reuse it)…')
      }
      logger.step(index, `${scenario.title} (${scenario.id}) — generating… [${index}/${total}]`)
    },
    onScenarioComplete: ({ index, total, scenario, run }) => {
      preview.clear()
      if (streamReport) {
        // Stream each section to stdout the moment it finishes; a `## suite`
        // header is emitted when the suite changes so the live report keeps
        // its grouping without buffering.
        if (run.suite !== lastSuite) {
          lastSuite = run.suite
          // No leading blank here: the header (first suite) and the previous
          // section's trailing blank (later suites) already provide the gap.
          logger.out(`## ${run.suite}\n\n`)
        }
        logger.out(formatScenarioSection(run) + '\n\n')
      }
      const composite =
        run.composite !== null ? `${(run.composite * 100).toFixed(0)}%` : 'n/a'
      const guardrails =
        run.axes.guardrails !== null ? `${(run.axes.guardrails * 100).toFixed(0)}%` : 'n/a'
      logger.dim(`  [${index}/${total}] ${scenario.id} → composite ${composite} · guardrails ${guardrails}`)
    },
  })
  preview.clear()

  for (const problem of problems) {
    logger.warn(`Scenario problem: ${problem.file} — ${problem.problems.join('; ')}`)
  }
  for (const problem of referenceProblems) {
    logger.warn(`Reference problem: ${problem.file} — ${problem.problems.join('; ')}`)
  }

  if (summary.runs.length === 0) {
    const scenariosDir = options.scenarios || defaultScenariosDir()
    const suiteHint = options.suite ? ` (suite: ${options.suite})` : ''
    const problemHint =
      problems.length > 0
        ? ` — ${problems.length} scenario file(s) failed validation (see warnings above)`
        : ''
    logger.error(`No scenarios ran from ${scenariosDir}${suiteHint}${problemHint}`)
    process.exit(1)
  }

  if (options.json) {
    const json = JSON.stringify(summary, null, 2)
    if (options.output) {
      writeFileSync(options.output, json)
      logger.info(`Report written to ${options.output}`)
    } else {
      logger.out(json + '\n')
    }
  } else if (options.output) {
    // --output keeps the full grouped report in the file, unchanged.
    writeFileSync(options.output, formatBenchmarkReport(summary))
    logger.info(`Report written to ${options.output}`)
  } else {
    // streamReport is true here (no --json, no --output): sections already
    // streamed live, so close the report with the Overall block.
    logger.out(formatBenchmarkOverall(summary) + '\n\n')
  }

  if (baseline) {
    const comparison = compareToBaseline(summary, baseline, tolerance)
    const text = formatBaselineComparison(comparison, tolerance)
    if (options.json) {
      // Keep stdout a pure JSON document; the gate result goes to stderr.
      if (comparison.ok) {
        logger.success(text)
      } else {
        logger.error(text)
      }
    } else {
      logger.out(text + '\n')
    }
    if (!comparison.ok) {
      logger.error(`Baseline FAILED: ${comparison.regressions.length} regression(s), ${comparison.missing.length} missing`)
      process.exit(1)
    }
    logger.success('Baseline OK — no axis regressed beyond tolerance')

    // P1-11: the release gate runs on top of the per-axis comparison — the
    // relative-composite floor, the guardrail failed-rate delta, and the
    // adherence drop. Any trip blocks the release (CI fails the workflow).
    const gate = gateBenchRelease(summary, baseline)
    if (!gate.ok) {
      for (const reason of gate.reasons) logger.error(`Release gate BLOCKED: ${reason}`)
      process.exit(1)
    }
    logger.success('Release gate OK — relative composite floor, guardrail failed rate, and adherence all within budget')
  }

  renderCompletionLine(summary)
}

function renderCompletionLine(summary: BenchSummary): void {
  const composite = summary.overallComposite !== null
    ? `${(summary.overallComposite * 100).toFixed(0)}%`
    : 'n/a'
  logger.success(`Benchmark complete: ${summary.runs.length} scenario(s) run, overall composite ${composite}`)
}
