import { createModelEditGenerate } from '../../src/bench/modelEditGenerate'
import { benchmarkFingerprint } from '../../src/bench/fingerprint'
import { runScenario } from '../../src/bench/runner'
import type { BenchScenario } from '../../src/bench/types'
import type { ModelRouter } from '../../src/model/ModelRouter'

const target = 'src/value.ts'
const source = "import { keep } from './keep'\nexport const value = 1\nkeep()\n"
const scenario: BenchScenario = { specVersion: 1, id: 'edit-test', title: 'edit', suite: 'data-flow', scaffoldable: false,
  prompt: 'Change value to 2', fixtures: { [target]: source }, expect: { files: [target], behaviors: ['export value 2'] },
  fixEdits: [{ file: target, find: '1', replace: 'HELD_OUT_ANSWER' }],
  correctness: { tests: false, typecheck: false, lint: false }, axes: ['guardrails', 'adherence'] }
const edit = { file: target, op: 'replace', from: 'value = 1', to: 'value = 2' }
const envelope = (edits: unknown) => JSON.stringify({ tool: 'propose_edits', arguments: { edits } })
function setup(content: string) {
  const generate = jest.fn().mockResolvedValue({ content, provider: 'local', stopReason: 'eogToken',
    model: { id: 'selected', source: 'configured' }, artifact: { sha256: 'a'.repeat(64), sizeBytes: 1, source: 'file' },
    providerCalls: [{ provider: 'local', status: 'response', durationMs: 3 }] })
  const onRawResponse = jest.fn()
  return { generate, onRawResponse, seam: createModelEditGenerate({ modelRouter: { generate } as unknown as ModelRouter, onRawResponse }) }
}

it('applies exact scoped edits, preserves surrounding code and fingerprints the actual tool request', async () => {
  const { seam, generate, onRawResponse } = setup(envelope([edit]))
  const attempts = jest.fn()
  expect(await seam(scenario, attempts)).toEqual([{ path: target, content: source.replace('value = 1', 'value = 2') }])
  expect(scenario.fixtures[target]).toBe(source)
  expect(generate).toHaveBeenCalledTimes(1)
  const request = generate.mock.calls[0][0]
  expect(request.tools[0].inputSchema.properties.edits.items.properties.file.const).toBe(target)
  expect(request.providerCallLimit).toBe(1)
  expect(JSON.stringify(request)).not.toContain('HELD_OUT_ANSWER')
  expect(attempts.mock.calls[0][0][0]).toMatchObject({ status: 'parsed', selected: true, editApplication: 'applied',
    requestDigest: benchmarkFingerprint(request), artifact: { sha256: 'a'.repeat(64) }, provider: 'local' })
  expect(JSON.stringify(attempts.mock.calls)).not.toContain(edit.from)
  expect(onRawResponse).toHaveBeenCalledWith(envelope([edit]), { index: 1, kind: 'initial' })
})

it.each([
  [], [null], [{ ...edit, file: '../outside.ts' }], [{ ...edit, file: 'src/other.ts' }],
  [{ ...edit, from: '' }], [{ ...edit, from: 'missing' }], [{ ...edit, to: edit.from }],
  [{ ...edit, op: 'write' }], [{ ...edit, extra: 'not allowed' }], Array(9).fill(edit),
  [edit, { ...edit, from: 'missing' }], [edit, { ...edit, from: 'value = 2', to: 'value = 1' }],
].map(edits => ({ edits })))('rejects invalid or partially applicable candidate %# without changing fixtures', async ({ edits }) => {
  const { seam } = setup(envelope(edits))
  const attempts = jest.fn()
  expect(await seam(scenario, attempts)).toEqual([])
  expect(scenario.fixtures[target]).toBe(source)
  expect(attempts.mock.calls[0][0][0]).toMatchObject({ status: 'invalid', selected: false, editApplication: 'rejected' })
})

it('rejects ambiguous anchors', async () => {
  const { seam } = setup(envelope([{ ...edit, from: 'keep' }]))
  expect(await seam(scenario)).toEqual([])
})

it.each(['not JSON', '{"answer":"done"}', '{"tool":"other","arguments":{}}', envelope({}),
  JSON.stringify({ tool: 'propose_edits', arguments: {}, answer: envelope([edit]) }),
  '[Local model fallback] ' + envelope([edit])])('never treats an invalid, answer or fallback payload as edits: %s', async content => {
  const { seam } = setup(content)
  expect(await seam(scenario)).toEqual([])
})

it('rejects unsupported targets before model calls', async () => {
  const { seam, generate } = setup(envelope([edit]))
  await expect(seam({ ...scenario, expect: { files: ['../outside.ts'], behaviors: [] } })).rejects.toThrow('one existing output file')
  await expect(seam({ ...scenario, expect: { files: [target, 'src/other.ts'], behaviors: [] } })).rejects.toThrow('one existing output file')
  expect(generate).not.toHaveBeenCalled()
})

it('retains provider failure without raw error disclosure', async () => {
  const { seam, generate } = setup('')
  generate.mockRejectedValue(new Error('PRIVATE_ERROR'))
  const attempts = jest.fn()
  expect(await seam(scenario, attempts)).toEqual([])
  expect(attempts.mock.calls[0][0][0].status).toBe('error')
  expect(JSON.stringify(attempts.mock.calls)).not.toContain('PRIVATE_ERROR')
})

it('whitelists model and artifact metadata instead of retaining unknown provider fields', async () => {
  const { seam, generate } = setup(envelope([edit]))
  generate.mockResolvedValue({ content: envelope([edit]), provider: 'local',
    model: { id: 'selected', source: 'configured', privatePrompt: 'PRIVATE_SOURCE' },
    artifact: { sha256: 'a'.repeat(64), sizeBytes: 1, source: 'file', privatePath: 'PRIVATE_SOURCE' },
  })
  const attempts = jest.fn()
  await seam(scenario, attempts)
  expect(JSON.stringify(attempts.mock.calls)).not.toContain('PRIVATE_SOURCE')
})

it('leaves generated source out of default scenario results', async () => {
  const { seam } = setup(envelope([edit]))
  const result = await runScenario({ ...scenario, fixEdits: undefined }, { generate: seam })
  expect(result.generatedArtifacts).toBeUndefined()
  expect(JSON.stringify(result)).not.toContain(source)
})
