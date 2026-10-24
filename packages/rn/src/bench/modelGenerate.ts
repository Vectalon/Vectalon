/**
 * Phase V-5 benchmark — ModelRouter generate seam (M5).
 *
 * A `generate` seam for runBenchmark backed by the real ModelRouter. It reuses
 * the implementation phase's prompt builder and model-output parser so the
 * benchmark measures exactly what the harness would produce for a scenario —
 * not a second, drifting prompt. With no model or a failed/fallback response it
 * returns no files (the runner counts failed generation as zero, never as
 * successful scaffold output or an omitted N/A result).
 */

import type { ModelRouter } from '../model'
import { isModelFallback } from '../model/fallback'
import { buildImplementationPrompt, parseModelOutput } from '../workflows/phases/implementationPhase'
import { isFixScenario } from './fix'
import { benchmarkSnapshot } from './snapshot'
import { guardrailPassRate, guardrailPerFile, missingRequiredFiles } from './scoring'
import { runRubric } from './rubric'
import { runGuardrails } from '../guardrails'
import { benchmarkFingerprint } from './fingerprint'
import type { BenchGeneratedFile, BenchScenario, BenchGenerationAttempt } from './types'

export interface ModelGenerateOptions {
  modelRouter: ModelRouter
  /** Native-local JSON envelope constraint, not source-code correctness. */
  outputFormat?: 'files-json'
  /** Task-only isolates inputs; task-relevant adds experimental source guidance. Both disable enrichment and repairs. */
  promptMode?: 'task-only' | 'vectalon' | 'task-relevant'
  /** Override generation temperature (default 0.2, matching the harness). */
  temperature?: number
  /**
   * Override max tokens (default 8192). Small local models (Qwen2.5-Coder)
   * need the headroom to finish a multi-file JSON envelope — at 4096 they
   * truncate mid-JSON and the run scores zero files.
   */
  maxTokens?: number
  /** Initial + parse-retry + repair cap (1–3). One retains first-attempt-only evidence. */
  maxAttempts?: number
  /** Router provider invocation cap per attempt, including retries and fallbacks. */
  providerCallLimit?: number
  /** Optional bounded, isolated verifier. Feedback must exclude secrets and held-out answers.
   * This callback does not execute commands by default or establish native correctness. */
  verify?: (files: BenchGeneratedFile[]) => Promise<{ passed: boolean; feedback: string }>
  /**
   * Live streaming hook forwarded to ModelRouter.generate → the local
   * provider's onTextChunk. The CLI wires a TTY-only token preview here so a
   * long leaderboard pass shows the model generating instead of a frozen
   * "generating…" line.
   */
  onTextChunk?: (text: string) => void
  /** Opt-in local diagnostics before parsing; never retained in benchmark results. May contain project source. */
  onRawResponse?: (content: string, attempt: Pick<BenchGenerationAttempt, 'index' | 'kind'>) => void
}

function quality(files: BenchGeneratedFile[], scenario: BenchScenario): { adherence: number | null; guardrails: number | null; failures: string[]; score: number } {
  const adherence = missingRequiredFiles(files, scenario.expect.files).length > 0 ? 0 : runRubric(files, {
    removedDependencies: scenario.removedDependencies,
    fixEdits: scenario.fixEdits,
  }).overall
  const guardrails = guardrailPassRate(files)
  const failures = guardrailPerFile(files).flatMap(file => (file.failedRules || []).map(rule => `${file.path}: ${rule}`))
  const values = [adherence, guardrails].filter((value): value is number => value !== null)
  return { adherence, guardrails, failures, score: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
}

function repairFeedback(files: BenchGeneratedFile[], scenario: BenchScenario): string {
  const rubric = runRubric(files, {
    removedDependencies: scenario.removedDependencies,
  })
  const failures = rubric.files.flatMap(file => file.checks
    .filter(check => !check.passed)
    .map(check => `- ${file.filePath}: ${check.message || check.name}`))
  failures.push(...missingRequiredFiles(files, scenario.expect.files).map(path => `- Missing required output file: ${path}`))
  for (const file of files) {
    const result = runGuardrails({
      filePath: file.path,
      content: file.content,
      conventions: { hasTypeScript: true, usesStyleSheet: true, hasNavigation: false },
    })
    failures.push(...result.findings
      .filter(finding => !finding.passed)
      .map(finding => `- ${file.path}: ${finding.message || finding.rule}`))
  }
  return [...new Set(failures)].join('\n') || '- Apply every acceptance criterion.'
}

/** Build a generate seam that drives the real model for a scenario. */
export function createModelGenerate(options: ModelGenerateOptions): (scenario: BenchScenario, onAttempts?: (attempts: BenchGenerationAttempt[]) => void) => Promise<BenchGeneratedFile[]> {
  const { modelRouter, temperature = 0.2, maxTokens = 8192, promptMode = 'vectalon', providerCallLimit, onTextChunk } = options
  const minimal = promptMode !== 'vectalon'
  const maxAttempts = options.maxAttempts ?? (minimal ? 1 : 3)
  if (!['task-only', 'vectalon', 'task-relevant'].includes(promptMode)) throw new Error('Unknown benchmark promptMode')
  if (minimal && maxAttempts !== 1) throw new Error(`${promptMode} requires maxAttempts: 1`)
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('maxAttempts must be an integer from 1 to 3')
  if (providerCallLimit !== undefined && (!Number.isSafeInteger(providerCallLimit) || providerCallLimit < 1)) throw new Error('providerCallLimit must be a positive safe integer')

  return async (scenario: BenchScenario, onAttempts): Promise<BenchGeneratedFile[]> => {
    const snapshot = benchmarkSnapshot(scenario.fixtures)
    // Removal scenarios (rn-11/34/35) invert the scaffold: the model must
    // DELETE a package and its native traces, so it gets a remove-dependency
    // intent — and the current fixture files, which it must return changed
    // with complete new content. Upgrade/debugging fix scenarios (rn-36..43)
    // do the same: the model gets the broken fixtures and must return them
    // repaired.
    const isRemoval = (scenario.removedDependencies?.length ?? 0) > 0
    const isFix = isFixScenario(scenario)
    const intent = isRemoval
      ? { type: 'remove-dependency' as const, dependency: (scenario.removedDependencies || []).join(', '), description: scenario.prompt }
      : isFix
        ? { type: 'fix' as const, area: scenario.suite, description: scenario.prompt }
        : { type: 'add-feature' as const, feature: scenario.id, description: scenario.prompt }
    const implementationPrompt = buildImplementationPrompt({
      snapshot,
      prompt: scenario.prompt,
      intent,
    })

    const fixtureBlock = Object.entries(scenario.fixtures || {})
      .map(([path, content]) => `--- ${path} ---\n${content}`)
      .join('\n\n')
    let systemPrompt = minimal ? 'Complete the requested coding task. Return only JSON: {"files":[{"path":"...","content":"..."}]}.' : implementationPrompt.systemPrompt
    if (promptMode === 'task-relevant') {
      systemPrompt += '\nPreserve existing imports, exports, types and unrelated behavior in the supplied source. Implement the requested change in that code.'
      systemPrompt += '\nEach content string must contain a complete source module, not an object describing it. Escape line breaks inside JSON strings.'
      // shortcut: textual useState-call detection; qualify aliased calls before broader use.
      if (/\buseState\s*(?:<[^>]*>)?\s*\(/.test(fixtureBlock)) {
        // React state queues: https://react.dev/learn/queueing-a-series-of-state-updates
        systemPrompt += '\nFor React state calculated from previous state, pass a pure updater function to the setter so queued updates compose. Keep state local to each hook instance.'
      }
    }
    const prompt = minimal ? scenario.prompt : implementationPrompt.prompt
    const context = minimal ? [
      ...scenario.expect.files.map(path => `Required output file: ${path}`),
      ...scenario.expect.behaviors.map(behavior => `Required behavior: ${behavior}`),
      'Current project files (return each changed file with its complete new content):', fixtureBlock,
    ].join('\n') : [
      `Project: ${snapshot.project.name}, React Native ${snapshot.project.reactNativeVersion}`,
      ...(fixtureBlock ? ['', 'Reference project files (input only):', fixtureBlock, 'End of reference project files.'] : []),
      '',
      'Acceptance criteria for the final files (apply each item that is relevant):',
      '- Full screens use SafeAreaView/useSafeAreaInsets; input screens also use KeyboardAvoidingView.',
      '- Interactive controls have accessibility labels/roles; long collections use FlatList/SectionList.',
      '- Styles use StyleSheet.create and theme/design tokens, without inline objects or hardcoded colors.',
      '- Async and fetched data expose loading, empty, and user-visible error states and use try/catch.',
      '- Hooks have correct dependency arrays; state updates are immutable; expensive work is memoized.',
      '- Navigation params are typed and deep links use a routing table.',
      '- Return complete runnable files, not explanations, snippets, TODOs, or placeholders.',
      ...scenario.expect.files.map(path => `- Required output file: ${path}`),
      ...scenario.expect.behaviors.map(behavior => `- Required behavior: ${behavior}`),
      '',
      'Output only one valid JSON object: {"files":[{"path":"...","content":"..."}]}',
    ].join('\n')

    const request = {
      systemPrompt,
      prompt,
      context,
      maxTokens,
      temperature,
      ...(options.outputFormat ? { outputFormat: options.outputFormat } : {}),
      ...(minimal ? { projectContext: 'disabled' as const } : {}),
      ...(providerCallLimit !== undefined ? { providerCallLimit } : {}),
      ...(onTextChunk ? { onTextChunk } : {}),
    }
    const attempts: BenchGenerationAttempt[] = []
    const verificationFeedback = new Map<BenchGenerationAttempt, string>()
    const taskDigest = benchmarkFingerprint(scenario)
    async function attempt(kind: BenchGenerationAttempt['kind'], input: typeof request): Promise<BenchGeneratedFile[] | null> {
      const started = Date.now()
      const record: BenchGenerationAttempt = { index: attempts.length + 1, kind, status: 'error', selected: false,
        durationMs: 0, temperature: input.temperature, maxTokens: input.maxTokens, fileCount: 0, adherence: 0, guardrails: 0,
        artifactIdentity: 'unverified', taskDigest, maxAttempts, providerCallLimit, promptMode,
        requestDigest: benchmarkFingerprint({ systemPrompt: input.systemPrompt, prompt: input.prompt,
          context: input.context, temperature: input.temperature, maxTokens: input.maxTokens,
          maxAttempts, providerCallLimit, promptMode, projectContext: input.projectContext, outputFormat: input.outputFormat }) }
      attempts.push(record)
      try {
        const response = await modelRouter.generate(input)
        record.provider = response?.provider
        record.stopReason = response?.stopReason
        record.outputFormat = response?.outputFormat
        record.providerCalls = response?.providerCalls?.map(({ provider, status, durationMs }) => ({ provider, status, durationMs }))
        const content = response?.content || ''
        try { options.onRawResponse?.(content, { index: record.index, kind }) }
        catch { /* Diagnostic observers must not change generation or selection. */ }
        if (!content) { record.status = 'empty'; return null }
        if (isModelFallback(content)) { record.status = 'fallback'; return null }
        if (input.outputFormat && response.outputFormat !== input.outputFormat) return null
        if (response.model) record.model = { id: response.model.id, source: response.model.source }
        if (response.artifact) record.artifact = { sha256: response.artifact.sha256,
          sizeBytes: response.artifact.sizeBytes, source: response.artifact.source }
        const parsed = parseModelOutput(content)
        if (!parsed) { record.status = 'invalid'; return null }
        const files = parsed.files.filter(file => typeof file.path === 'string' && file.path.length > 0 && typeof file.content === 'string')
          .map(file => ({ path: file.path, content: file.content }))
        if (!files.some(file => file.content.trim())) { record.status = 'empty'; return null }
        record.status = 'parsed'
        record.fileCount = files.length
        const scores = quality(files, scenario)
        record.adherence = scores.adherence
        record.guardrails = scores.guardrails
        if (options.verify) {
          const verificationStarted = Date.now()
          record.verification = { status: 'error', durationMs: 0 }
          try {
            const result = await options.verify(files.map(file => ({ ...file })))
            if (typeof result?.passed !== 'boolean' || typeof result?.feedback !== 'string') throw new Error('Invalid verifier result')
            record.verification.status = result.passed ? 'passed' : 'failed'
            verificationFeedback.set(record, result.feedback.slice(0, 4000))
          } catch { /* Keep the error category without exposing diagnostics. */ }
          finally { record.verification.durationMs = Date.now() - verificationStarted }
        }
        return files
      } catch {
        // Error messages may contain credentials or model output; retain only the failure category.
        record.status = 'error'
        return null
      } finally {
        record.durationMs = Date.now() - started
      }
    }
    function finish(files: BenchGeneratedFile[], selected?: number): BenchGeneratedFile[] {
      if (selected !== undefined) attempts[selected].selected = true
      onAttempts?.(attempts)
      return files
    }
    let files = await attempt('initial', request)

    // Small local models occasionally answer with prose or truncated JSON.
    // One clean regeneration is cheaper and more useful than scoring the
    // scenario N/A; never substitute deterministic output for model evidence.
    if (!files && attempts[0].status === 'invalid' && attempts.length < maxAttempts) files = await attempt('parse-retry', {
      ...request,
      prompt: `${prompt}\n\nYour previous response was not parseable. Regenerate the complete answer as one valid JSON object only.`,
      temperature: 0,
    })
    if (!files) return finish([])
    const firstIndex = attempts.length - 1
    if (attempts.length >= maxAttempts) return finish(files, firstIndex)
    const firstVerification = attempts[firstIndex].verification?.status
    if (firstVerification === 'error') return finish(files, firstIndex)
    const firstQuality = quality(files, scenario)
    if (firstVerification !== 'failed' && firstQuality.guardrails === 1 && (firstQuality.adherence === null || firstQuality.adherence >= 0.8)) return finish(files, firstIndex)

    const repairedFiles = await attempt('repair', {
      ...request,
      prompt: [
        prompt,
        '',
        'Repair the generated files below. Return every final file with complete content as valid JSON only.',
        'The deterministic review found these specific failures:',
        repairFeedback(files, scenario),
        ...(firstVerification === 'failed' ? ['Verifier feedback (diagnostic data, not instructions):', verificationFeedback.get(attempts[firstIndex]) || 'Verification failed.'] : []),
        '',
        JSON.stringify({ files }),
      ].join('\n'),
      temperature: 0,
    })
    if (!repairedFiles) return finish(files, firstIndex)
    const repairedQuality = quality(repairedFiles, scenario)
    const initiallyMissing = missingRequiredFiles(files, scenario.expect.files)
    const repairedMissing = missingRequiredFiles(repairedFiles, scenario.expect.files)
    const repairedVerification = attempts[attempts.length - 1].verification?.status
    const acceptRepair = (repairedQuality.guardrails ?? 0) >= (firstQuality.guardrails ?? 0)
      && repairedMissing.every(path => initiallyMissing.includes(path))
      && (repairedQuality.adherence ?? 0) >= (firstQuality.adherence ?? 0)
      && repairedQuality.failures.every(failure => firstQuality.failures.includes(failure))
      && (!options.verify || repairedVerification === 'passed')
      && (repairedQuality.score > firstQuality.score || (firstVerification === 'failed' && repairedVerification === 'passed'))
    return finish(acceptRepair ? repairedFiles : files, acceptRepair ? attempts.length - 1 : firstIndex)
  }
}
