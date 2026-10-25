// Development-only single-file edit diagnostic; not exported as a customer workflow.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { parse } from '@babel/parser'
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
    const source = scenario.fixtures[target]
    let tree: ReturnType<typeof parse>
    try { tree = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }) }
    catch { throw new Error('Edit diagnostic requires parseable TypeScript/JSX source') }
    // shortcut: top-level blocks only; nested edits need separate measured qualification.
    const blocks = tree.program.body.map((node, index) => ({ id: `block-${index + 1}`, type: node.type,
      lines: `${node.loc?.start.line}-${node.loc?.end.line}`, from: source.slice(node.start!, node.end!),
    })).filter(block => block.from && source.split(block.from).length === 2)
    if (!blocks.length) throw new Error('Edit diagnostic requires a unique source block')
    const anchors = blocks.map(block => block.id)
    const tool = { name: 'propose_edits', description: `Propose 1–8 exact edits to ${target}; unrelated source is preserved.`, inputSchema: {
      type: 'object', additionalProperties: false, required: ['edits'], properties: { edits: {
        type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false,
          required: ['file', 'op', 'from', 'to'], properties: { file: { const: target }, op: { enum: ['replace', 'insert-after'] },
            from: { type: 'string', enum: anchors }, to: { type: 'string' } },
        },
      } },
    } }
    const request = {
      systemPrompt: ['Implement the requested change by editing complete top-level source blocks, not whole-file regeneration.',
        'Keep unrelated imports, exports and existing behavior unchanged. Return complete replacement text for each edit, not placeholders.',
        'Choose from as a listed block ID. Select each block at most once; combine all changes to that block in one edit.',
        'Use replace with the complete updated declaration, including unchanged members/body, or insert-after to add a complete top-level declaration.',
        'Keep executable code inside functions, not interfaces. Preserve line breaks and unrelated behavior. Do not edit other files.',
        buildToolCallSystemPrompt([tool], tool.name)].join('\n'),
      context: [Object.entries(scenario.fixtures).map(([path, content]) => `--- ${path} ---\n${content}`).join('\n\n'),
        `Editable blocks in ${target}:\n` + blocks.map(block => `${block.id}: ${block.type}, lines ${block.lines}\n${block.from}`).join('\n\n')].join('\n\n'),
      prompt: [scenario.prompt, ...scenario.expect.behaviors,
        `Delivery protocol: call propose_edits for ${target} instead of returning full files. The harness applies the edits and supplies unchanged source.`].join('\n'),
      tools: [tool], requiredTool: tool.name, temperature: options.temperature ?? 0.2, maxTokens: options.maxTokens ?? 2048, providerCallLimit: 1,
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
      if (response.localContext) record.localContext = { inputTokens: response.localContext.inputTokens, maxOutputTokens: response.localContext.maxOutputTokens,
        contextSize: response.localContext.contextSize, batchSize: response.localContext.batchSize }
      record.stopReason = response.stopReason
      record.providerCalls = response.providerCalls?.map(({ provider, status, durationMs }) => ({ provider, status, durationMs }))
      const content = response.content || ''
      try { options.onRawResponse?.(content, { index: 1, kind: 'initial' }) } catch { /* Diagnostics cannot change selection. */ }
      if (!content) { record.status = 'empty'; return [] }
      if (isModelFallback(content)) { record.status = 'fallback'; return [] }
      record.status = 'invalid'
      record.editApplication = 'rejected'
      if (response.requiredTool !== tool.name) return []
      const parsed = parseToolCallOutput(content)
      if (parsed.kind !== 'tool-call' || parsed.tool !== tool.name || Object.keys(parsed.arguments).some(key => key !== 'edits')) return []
      const edits = parsed.arguments.edits
      if (!Array.isArray(edits) || edits.length < 1 || edits.length > 8 || edits.some(edit => !edit ||
        Object.keys(edit).some(key => !['file', 'op', 'from', 'to'].includes(key)) || edit.file !== target ||
        !['replace', 'insert-after'].includes(edit.op) || !anchors.includes(edit.from) || typeof edit.to !== 'string') ||
        new Set(edits.map(edit => edit.from)).size !== edits.length) return []
      // A truncated block must not consume an unchanged neighboring statement.
      try { for (const edit of edits) parse(edit.to, { sourceType: 'module', plugins: ['typescript', 'jsx'], allowUndeclaredExports: true }) }
      catch { return [] }
      root = mkdtempSync(join(tmpdir(), 'vectalon-model-edits-'))
      const file = join(root, target)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, scenario.fixtures[target])
      const applied = applyEdits(root, edits.map(edit => ({ ...edit, from: blocks.find(block => block.id === edit.from)!.from,
        summary: 'Model-proposed edit' } as FixEdit)))
      if (applied.skipped.length || applied.applied.length !== edits.length) return []
      const next = readFileSync(file, 'utf8')
      if (next === scenario.fixtures[target]) return []
      try { parse(next, { sourceType: 'module', plugins: ['typescript', 'jsx'] }) }
      catch { return [] }
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
