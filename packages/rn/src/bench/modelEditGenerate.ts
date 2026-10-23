// Development-only single-file edit diagnostic; not exported as a customer workflow.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { applyEdits } from '../fix/apply'
import type { FixEdit } from '../fix/types'
import { isSafeProjectPath } from '../workflows/phases/fileOutput'
import { buildToolCallSystemPrompt, parseToolCallOutput } from '../model/toolCalling'
import { isModelFallback } from '../model/fallback'
import { benchmarkFingerprint } from './fingerprint'
import { guardrailPassRate } from './scoring'
import { runRubric } from './rubric'
import type { ModelGenerateOptions } from './modelGenerate'
import type { BenchGenerationAttempt, BenchGeneratedFile, BenchScenario } from './types'

export function createModelEditGenerate(options: Pick<ModelGenerateOptions, 'modelRouter' | 'temperature' | 'maxTokens' | 'onRawResponse'>) {
  return async (scenario: BenchScenario, onAttempts?: (attempts: BenchGenerationAttempt[]) => void): Promise<BenchGeneratedFile[]> => {
    const [target] = scenario.expect.files
    if (scenario.expect.files.length !== 1 || !isSafeProjectPath(target) || typeof scenario.fixtures[target] !== 'string') {
      throw new Error('Edit diagnostic requires exactly one existing output file')
    }
    const tool = { name: 'propose_edits', description: `Propose 1–8 exact edits to ${target}; unrelated source is preserved.`, inputSchema: {
      type: 'object', additionalProperties: false, required: ['edits'], properties: { edits: {
        type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false,
          required: ['file', 'op', 'from', 'to'], properties: { file: { const: target }, op: { enum: ['replace', 'insert-after'] },
            from: { type: 'string', minLength: 1 }, to: { type: 'string' } },
        },
      } },
    } }
    const request = {
      systemPrompt: ['Implement the requested change using exact literal edits, not whole-file regeneration.',
        'Keep unrelated imports, exports and existing behavior unchanged. Return complete replacement text for each edit, not placeholders.',
        'Each from anchor must occur exactly once in the current file. Do not guess or edit other files.',
        buildToolCallSystemPrompt([tool])].join('\n'),
      context: Object.entries(scenario.fixtures).map(([path, content]) => `--- ${path} ---\n${content}`).join('\n\n'),
      prompt: [scenario.prompt, ...scenario.expect.behaviors,
        `Delivery protocol: call propose_edits for ${target} instead of returning full files. The harness applies the edits and supplies unchanged source.`].join('\n'),
      tools: [tool], temperature: options.temperature ?? 0.2, maxTokens: options.maxTokens ?? 2048, providerCallLimit: 1,
    }
    const record: BenchGenerationAttempt & { editApplication: 'not-run' | 'rejected' | 'applied' } = {
      index: 1, kind: 'initial', status: 'error', selected: false, durationMs: 0, fileCount: 0,
      adherence: null, guardrails: null, artifactIdentity: 'unverified',
      taskDigest: benchmarkFingerprint(scenario), requestDigest: benchmarkFingerprint(request),
      temperature: request.temperature, maxTokens: request.maxTokens, maxAttempts: 1, providerCallLimit: 1,
      promptMode: 'vectalon', editApplication: 'not-run',
    }
    const started = Date.now()
    let root: string | undefined
    try {
      const response = await options.modelRouter.generate(request)
      record.provider = response.provider
      if (response.model) record.model = { id: response.model.id, source: response.model.source }
      if (response.artifact) record.artifact = { sha256: response.artifact.sha256,
        sizeBytes: response.artifact.sizeBytes, source: response.artifact.source }
      record.stopReason = response.stopReason
      record.providerCalls = response.providerCalls?.map(({ provider, status, durationMs }) => ({ provider, status, durationMs }))
      const content = response.content || ''
      try { options.onRawResponse?.(content, { index: 1, kind: 'initial' }) } catch { /* Diagnostics cannot change selection. */ }
      if (!content) { record.status = 'empty'; return [] }
      if (isModelFallback(content)) { record.status = 'fallback'; return [] }
      record.status = 'invalid'
      record.editApplication = 'rejected'
      const parsed = parseToolCallOutput(content)
      if (parsed.kind !== 'tool-call' || parsed.tool !== tool.name || Object.keys(parsed.arguments).some(key => key !== 'edits')) return []
      const edits = parsed.arguments.edits
      if (!Array.isArray(edits) || edits.length < 1 || edits.length > 8 || edits.some(edit => !edit ||
        Object.keys(edit).some(key => !['file', 'op', 'from', 'to'].includes(key)) || edit.file !== target ||
        !['replace', 'insert-after'].includes(edit.op) || typeof edit.from !== 'string' || !edit.from || typeof edit.to !== 'string')) return []
      root = mkdtempSync(join(tmpdir(), 'vectalon-model-edits-'))
      const file = join(root, target)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, scenario.fixtures[target])
      const applied = applyEdits(root, edits.map(edit => ({ ...edit, summary: 'Model-proposed edit' } as FixEdit)))
      if (applied.skipped.length || applied.applied.length !== edits.length) return []
      const next = readFileSync(file, 'utf8')
      if (next === scenario.fixtures[target]) return []
      const files = [{ path: target, content: next }]
      record.editApplication = 'applied'
      record.status = 'parsed'
      record.fileCount = 1
      record.adherence = runRubric(files).overall
      record.guardrails = guardrailPassRate(files)
      record.selected = true
      return files
    } catch { record.status = 'error'; return [] }
    finally {
      if (root) rmSync(root, { recursive: true, force: true })
      record.durationMs = Date.now() - started
      onAttempts?.([record])
    }
  }
}
