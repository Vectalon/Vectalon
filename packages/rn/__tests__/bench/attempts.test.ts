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

function generator(responses: Array<string | Error>) {
  const generate = jest.fn().mockImplementation(async () => {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return { content: response || '', provider: 'test' }
  })
  return { generate, seam: createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] }) }
}

describe('model attempt evidence', () => {
  it('fingerprints JSON deterministically without ignoring meaningful changes', () => {
    expect(benchmarkFingerprint({ b: 2, a: { y: 1, x: 0 } })).toBe(benchmarkFingerprint({ a: { x: 0, y: 1 }, b: 2 }))
    expect(benchmarkFingerprint(['a', 'b'])).not.toBe(benchmarkFingerprint(['b', 'a']))
    expect(benchmarkFingerprint(['a', 'b'])).toBe('sha256:0473ef2dc0d324ab659d3580c1134e9d812035905c4781fdd6d529b0c6860e13')
    expect(benchmarkFingerprint({ value: 'before' })).not.toBe(benchmarkFingerprint({ value: 'after' }))
  })

  it('records response model identity, never upgrading a configured name to a verified artifact', async () => {
    const generate = jest.fn().mockResolvedValue({ content: answer(), provider: 'local',
      model: { id: 'actual-fallback-model', source: 'configured' } })
    const seam = createModelGenerate({ modelRouter: { generate } as unknown as ModelGenerateOptions['modelRouter'] })
    const run = await runScenario(scenario, { generate: seam })
    expect(run.attempts![0]).toMatchObject({ provider: 'local', model: { id: 'actual-fallback-model', source: 'configured' }, artifactIdentity: 'unverified' })
    expect(run.attempts![0].taskDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(run.attempts![0].requestDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(formatScenarioSection(run)).toContain('internal provider retries/fallback calls are not counted')
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
