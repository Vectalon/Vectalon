import { createModelGenerate, formatScenarioSection, runScenario } from '../../src/bench'
import type { BenchScenario, ModelGenerateOptions } from '../../src/bench'
import { benchmarkFingerprint } from '../../src/bench/fingerprint'

const scenario: BenchScenario = {
  id: 'attempt-evidence', specVersion: 1, suite: 'testing', title: 'Attempt evidence',
  prompt: 'Create a typed constant', scaffoldable: false, fixtures: {},
  expect: { files: ['src/value.ts'], behaviors: [] },
  correctness: { tests: false, typecheck: false, lint: false }, axes: ['adherence', 'guardrails'],
}
const source = 'export const privateFixtureValue = 42;'
const answer = (path = 'src/value.ts') => JSON.stringify({ files: [{ path, content: source }] })

function generator(responses: Array<string | Error>, options: Partial<ModelGenerateOptions> = {}) {
  const generate = jest.fn().mockImplementation(async () => {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return { content: response || '', provider: 'test' }
  })
  return { generate, seam: createModelGenerate({ ...options, modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] }) }
}

describe('model attempt evidence', () => {
  it('distinguishes constrained requests in evidence fingerprints', async () => {
    const generate = jest.fn().mockResolvedValue({ content: answer(), provider: 'local', outputFormat: 'files-json' })
    const modelRouter = { generate } as unknown as ModelGenerateOptions['modelRouter']
    const plain = await runScenario(scenario, { generate: createModelGenerate({ modelRouter, maxAttempts: 1 }) })
    const constrained = await runScenario(scenario, { generate: createModelGenerate({ modelRouter, maxAttempts: 1, outputFormat: 'files-json' }) })
    expect(plain.attempts?.[0].requestDigest).not.toBe(constrained.attempts?.[0].requestDigest)
    expect(plain.attempts?.[0].taskDigest).toBe(constrained.attempts?.[0].taskDigest)
  })

  it.each([true, false])('requires provider acknowledgement for file grammar (%s)', async applied => {
    const generate = jest.fn().mockResolvedValue({ content: answer(), provider: 'local',
      ...(applied ? { outputFormat: 'files-json' } : {}) })
    const seam = createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'],
      maxAttempts: 1, outputFormat: 'files-json' })
    const run = await runScenario(scenario, { generate: seam })
    expect(generate.mock.calls[0][0].outputFormat).toBe('files-json')
    expect(run.generatedFiles).toEqual(applied ? ['src/value.ts'] : [])
    expect(run.attempts?.[0].status).toBe(applied ? 'parsed' : 'error')
    if (applied) expect(formatScenarioSection(run)).toContain('Applied output grammar: files-json')
  })

  it('retains termination on invalid output without claiming correctness', async () => {
    const generate = createModelGenerate({ maxAttempts: 1, modelRouter: {
      generate: async () => ({ content: 'incomplete', provider: 'local', stopReason: 'maxTokens' }),
    } as unknown as ModelGenerateOptions['modelRouter'] })
    const run = await runScenario(scenario, { generate })
    expect(run.attempts?.[0]).toMatchObject({ status: 'invalid', stopReason: 'maxTokens', selected: false })
    expect(formatScenarioSection(run)).toContain('Engine stop reason: maxTokens')
  })

  it('repairs a verification failure even when static scores pass, keeping feedback out of reports', async () => {
    const verify = jest.fn().mockResolvedValueOnce({ passed: false, feedback: 'COMPILER_DIAGNOSTIC' })
      .mockResolvedValueOnce({ passed: true, feedback: '' })
    const { seam, generate } = generator([answer(), answer()], { verify, maxAttempts: 2 })
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1][0].prompt).toContain('COMPILER_DIAGNOSTIC')
    expect(run.attempts?.map(a => [a.verification?.status, a.selected])).toEqual([['failed', false], ['passed', true]])
    expect(JSON.stringify(run)).not.toContain('COMPILER_DIAGNOSTIC')
    expect(formatScenarioSection(run)).toContain('Supplied verifier: failed')
  })

  it.each(['failed', 'error'])('rejects a statically improved repair when its verifier is %s', async status => {
    const verify = jest.fn().mockResolvedValueOnce({ passed: false, feedback: 'missing file' })
    if (status === 'error') verify.mockRejectedValueOnce(new Error('PRIVATE_ERROR'))
    else verify.mockResolvedValueOnce({ passed: false, feedback: 'still wrong' })
    const { seam } = generator([answer('src/wrong.ts'), answer()], { verify })
    const run = await runScenario(scenario, { generate: seam })
    expect(run.generatedFiles).toEqual(['src/wrong.ts'])
    expect(run.attempts?.[1].verification?.status).toBe(status)
    expect(JSON.stringify(run)).not.toContain('PRIVATE_ERROR')
  })

  it('records verifier errors without hiding parsed output or starting speculative repair', async () => {
    const { seam, generate } = generator([answer()], { verify: async () => { throw new Error('PRIVATE_ERROR') } })
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(run.attempts?.[0]).toMatchObject({ status: 'parsed', verification: { status: 'error' }, selected: true })
    expect(JSON.stringify(run)).not.toContain('PRIVATE_ERROR')
  })

  it('keeps task-only generation capped when supplied verification fails', async () => {
    const { seam, generate } = generator([answer()], { promptMode: 'task-only', verify: async () => ({ passed: false, feedback: 'failed' }) })
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(run.attempts?.[0].verification?.status).toBe('failed')
  })

  it('does not let a passing verifier waive static regressions', async () => {
    const verify = jest.fn().mockResolvedValueOnce({ passed: false, feedback: 'wrong value' })
      .mockResolvedValueOnce({ passed: true, feedback: '' })
    const worse = JSON.stringify({ files: [{ path: 'src/value.ts', content: 'export const privateFixtureValue: any = 42;' }] })
    const { seam } = generator([answer(), worse], { verify })
    const run = await runScenario(scenario, { generate: seam, includeGenerated: true })
    expect(run.generatedArtifacts?.[0].content).toBe(source)
    expect(run.attempts?.map(a => a.selected)).toEqual([true, false])
  })

  it('treats malformed verifier results as errors', async () => {
    const { seam, generate } = generator([answer()], { verify: jest.fn().mockResolvedValue({ passed: 'yes', feedback: '' }) })
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts?.[0].verification?.status).toBe('error')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('passes copies to the verifier so it cannot silently replace generated source', async () => {
    const { seam } = generator([answer()], { verify: async files => {
      files[0].content = 'not generated'; return { passed: true, feedback: '' }
    } })
    const run = await runScenario(scenario, { generate: seam, includeGenerated: true })
    expect(run.generatedArtifacts?.[0].content).toBe(source)
  })

  it('isolates task-only prompts while retaining the same fixture and acceptance inputs', async () => {
    const task = { ...scenario, fixtures: { 'src/value.ts': 'export const oldValue = 1' },
      expect: { files: ['src/value.ts'], behaviors: ['export a typed constant'] },
      fixEdits: [{ file: 'src/value.ts', find: 'oldValue', replace: 'HELD_OUT_ANSWER' }] }
    const baseline = generator([answer('src/wrong.ts'), answer()], { promptMode: 'task-only' })
    const harness = generator([answer()], { maxAttempts: 1 })
    const baseRun = await runScenario(task, { generate: baseline.seam })
    const harnessRun = await runScenario(task, { generate: harness.seam })
    const baseRequest = baseline.generate.mock.calls[0][0]
    const harnessRequest = harness.generate.mock.calls[0][0]
    expect(baseline.generate).toHaveBeenCalledTimes(1)
    expect(baseRequest.prompt).toBe(task.prompt)
    expect(baseRequest.projectContext).toBe('disabled')
    expect(harnessRequest.projectContext).toBeUndefined()
    for (const request of [baseRequest, harnessRequest]) {
      expect(request.context).toContain(task.fixtures['src/value.ts'])
      expect(request.context).toContain('src/value.ts')
      expect(request.context).toContain('export a typed constant')
      expect(JSON.stringify(request)).not.toContain('HELD_OUT_ANSWER')
    }
    expect(baseRequest.context).not.toContain('SafeAreaView')
    expect(harnessRequest.context).toContain('SafeAreaView')
    expect(baseRun.attempts![0]).toMatchObject({ promptMode: 'task-only', maxAttempts: 1 })
    expect(baseRun.attempts![0].taskDigest).toBe(harnessRun.attempts![0].taskDigest)
    expect(baseRun.attempts![0].requestDigest).not.toBe(harnessRun.attempts![0].requestDigest)
    expect(formatScenarioSection(baseRun)).toContain('Prompt condition: task-only')
  })

  it('rejects repair-enabled task-only runs', () => {
    expect(() => generator([], { promptMode: 'task-only', maxAttempts: 2 })).toThrow('task-only requires')
  })

  it.each(['not JSON', answer('src/wrong.ts')])('retains the first outcome without retry or repair when capped at one', async response => {
    const { generate, seam } = generator([response, answer()], { maxAttempts: 1, providerCallLimit: 1 })
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0].providerCallLimit).toBe(1)
    expect(run.attempts).toHaveLength(1)
    expect(run.attempts![0]).toMatchObject({ maxAttempts: 1, providerCallLimit: 1 })
    expect(run.axes.adherence).toBe(0)
    expect(formatScenarioSection(run)).toContain('1 generation attempts · 1 provider calls per attempt')
  })

  it('counts parse recovery against the total attempt cap', async () => {
    const { generate, seam } = generator(['not JSON', answer('src/wrong.ts'), answer()], { maxAttempts: 2 })
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(run.attempts?.map(attempt => attempt.kind)).toEqual(['initial', 'parse-retry'])
    expect(run.axes.adherence).toBe(0)
  })

  it.each([0, -1, 1.5, 4, NaN, Infinity])('rejects invalid attempt caps %s before inference', maxAttempts => {
    expect(() => generator([], { maxAttempts })).toThrow('maxAttempts')
  })

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid provider caps %s before inference', providerCallLimit => {
    expect(() => generator([], { providerCallLimit })).toThrow('providerCallLimit')
  })

  it('retains provider failures on fallback output without copying private fields', async () => {
    const generate = jest.fn().mockResolvedValue({ content: '[Model fallback: failed]', provider: 'openai',
      providerCalls: [{ provider: 'openai', status: 'error', durationMs: 5, error: 'private credential', prompt: source }] })
    const seam = createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts![0].providerCalls).toEqual([{ provider: 'openai', status: 'error', durationMs: 5 }])
    expect(JSON.stringify(run)).not.toContain('private credential')
    expect(JSON.stringify(run)).not.toContain(source)
    expect(formatScenarioSection(run)).toContain('openai: error · 5ms')
  })

  it('fingerprints JSON deterministically without ignoring meaningful changes', () => {
    expect(benchmarkFingerprint({ b: 2, a: { y: 1, x: 0 } })).toBe(benchmarkFingerprint({ a: { x: 0, y: 1 }, b: 2 }))
    expect(benchmarkFingerprint(['a', 'b'])).not.toBe(benchmarkFingerprint(['b', 'a']))
    expect(benchmarkFingerprint(['a', 'b'])).toBe('sha256:0473ef2dc0d324ab659d3580c1134e9d812035905c4781fdd6d529b0c6860e13')
    expect(benchmarkFingerprint({ value: 'before' })).not.toBe(benchmarkFingerprint({ value: 'after' }))
  })

  it('records response model identity, never upgrading a configured name to a verified artifact', async () => {
    const artifact = { sha256: 'a'.repeat(64), sizeBytes: 12, source: 'local-file-at-load' }
    const generate = jest.fn().mockResolvedValue({ content: answer(), provider: 'local',
      artifact: { ...artifact, filePath: '/private/model.gguf' },
      model: { id: 'actual-fallback-model', source: 'configured' } })
    const seam = createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts![0]).toMatchObject({ provider: 'local', model: { id: 'actual-fallback-model', source: 'configured' }, artifactIdentity: 'unverified' })
    expect(run.attempts![0].taskDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(run.attempts![0].requestDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(run.attempts![0].artifact).toEqual(artifact)
    expect(JSON.stringify(run)).not.toContain('/private/model.gguf')
    expect(formatScenarioSection(run)).toContain('not backend attestation')
    expect(formatScenarioSection(run)).toContain('do not measure tokens, cost or provider-internal work')
    expect(formatScenarioSection(run)).toContain('Provider invocations: unrecorded')
    expect(formatScenarioSection(run)).toContain('before provider enrichment')
  })

  it('changes task and request fingerprints when task input changes', async () => {
    const one = await runScenario(scenario, { generate: generator([answer()]).seam })
    const two = await runScenario({ ...scenario, prompt: 'A different task' }, { generate: generator([answer()]).seam })
    const repeat = await runScenario(scenario, { generate: generator([answer()]).seam })
    expect(one.attempts![0].taskDigest).not.toBe(two.attempts![0].taskDigest)
    expect(one.attempts![0].requestDigest).not.toBe(two.attempts![0].requestDigest)
    expect(one.attempts![0].taskDigest).toBe(repeat.attempts![0].taskDigest)
    expect(one.attempts![0].requestDigest).toBe(repeat.attempts![0].requestDigest)
    expect(one.attempts![0].model).toBeUndefined()
    expect(formatScenarioSection(one)).toContain('configured model: unknown')
  })
  it('records first-pass success without exposing source by default', async () => {
    const { seam, generate } = generator([answer()])
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(run.attempts).toEqual([expect.objectContaining({ index: 1, kind: 'initial', status: 'parsed',
      selected: true, provider: 'test', fileCount: 1, temperature: 0.2, maxTokens: 8192 })])
    expect(run.attempts![0].durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(run)).not.toContain(source)
    expect(formatScenarioSection(run)).toContain('Attempt 1 (initial): parsed · selected')
    expect(formatScenarioSection(run)).toContain('not verified task completion')
  })

  it('distinguishes parse recovery from first-pass success', async () => {
    const { seam } = generator(['not JSON', answer()])
    const run = await runScenario(scenario, { generate: seam, includeGenerated: true })
    expect(run.attempts?.map(item => [item.kind, item.status, item.selected])).toEqual([
      ['initial', 'invalid', false], ['parse-retry', 'parsed', true],
    ])
    expect(run.attempts![1].temperature).toBe(0)
    expect(run.attempts![0].taskDigest).toBe(run.attempts![1].taskDigest)
    expect(run.attempts![0].requestDigest).not.toBe(run.attempts![1].requestDigest)
    expect(run.generatedArtifacts).toEqual([{ path: 'src/value.ts', content: source }])
  })

  it('records an accepted repair separately from the initial output', async () => {
    const { seam } = generator([answer('src/wrong.ts'), answer()])
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts?.map(item => [item.kind, item.selected])).toEqual([['initial', false], ['repair', true]])
    expect(run.attempts![0].adherence).toBe(0)
    expect(run.generatedFiles).toEqual(['src/value.ts'])
  })

  it('records a rejected repair without replacing the initial output', async () => {
    const { seam } = generator([answer('src/wrong.ts'), answer('src/also-wrong.ts')])
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts?.map(item => item.selected)).toEqual([true, false])
    expect(run.generatedFiles).toEqual(['src/wrong.ts'])
  })

  it.each([
    ['', 'empty'],
    ['[Local model fallback] no downloaded model', 'fallback'],
    [new Error('sensitive provider credential'), 'error'],
  ])('retains failed initial calls as evidence without exposing content', async (response, status) => {
    const { seam, generate } = generator([response])
    const run = await runScenario(scenario, { generate: seam })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(run.attempts![0]).toMatchObject({ status, selected: false, adherence: 0, guardrails: 0 })
    expect(run.generatedFiles).toEqual([])
    expect(run.axes.adherence).toBe(0)
    expect(JSON.stringify(run)).not.toContain('sensitive provider credential')
  })

  it('retains the initial candidate when the repair provider fails', async () => {
    const { seam } = generator([answer('src/wrong.ts'), new Error('sensitive repair detail')])
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts?.map(item => [item.status, item.selected])).toEqual([['parsed', true], ['error', false]])
    expect(run.generatedFiles).toEqual(['src/wrong.ts'])
    expect(JSON.stringify(run)).not.toContain('sensitive repair detail')
  })
})
