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
const edit = { file: target, op: 'replace', from: 'block-2', to: 'export const value = 2' }
const envelope = (edits: unknown) => JSON.stringify({ tool: 'propose_edits', arguments: { edits } })
function setup(content: string) {
  const generate = jest.fn().mockResolvedValue({ content, provider: 'local', requiredTool: 'propose_edits', stopReason: 'eogToken',
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
  expect(request.tools[0].inputSchema.properties.edits.items.properties.from.enum).toEqual(['block-1', 'block-2', 'block-3'])
  expect(request.context).toContain('block-2: ExportNamedDeclaration, lines 2-2')
  expect(request.providerCallLimit).toBe(1)
  expect(request.requiredTool).toBe('propose_edits')
  expect(JSON.stringify(request)).not.toContain('HELD_OUT_ANSWER')
  expect(attempts.mock.calls[0][0][0]).toMatchObject({ status: 'parsed', selected: true, editApplication: 'applied',
    requestDigest: benchmarkFingerprint(request), artifact: { sha256: 'a'.repeat(64) }, provider: 'local' })
  expect(JSON.stringify(attempts.mock.calls)).not.toContain(edit.from)
  expect(onRawResponse).toHaveBeenCalledWith(envelope([edit]), { index: 1, kind: 'initial' })
})

it.each([
  [], [null], [{ ...edit, file: '../outside.ts' }], [{ ...edit, file: 'src/other.ts' }],
  [{ ...edit, from: '' }], [{ ...edit, from: 'missing' }], [{ ...edit, to: 'export const value = 1' }],
  [{ ...edit, op: 'write' }], [{ ...edit, extra: 'not allowed' }], Array(9).fill(edit),
  [edit, { ...edit, from: 'missing' }], [edit, { ...edit, from: 'value = 2', to: 'value = 1' }],
].map(edits => ({ edits })))('rejects invalid or partially applicable candidate %# without changing fixtures', async ({ edits }) => {
  const { seam } = setup(envelope(edits))
  const attempts = jest.fn()
  expect(await seam(scenario, attempts)).toEqual([])
  expect(scenario.fixtures[target]).toBe(source)
  expect(attempts.mock.calls[0][0][0]).toMatchObject({ status: 'invalid', selected: false, editApplication: 'rejected' })
})

it('rejects a valid proposal without provider acknowledgement of required arguments', async () => {
  const { seam, generate } = setup(envelope([edit]))
  generate.mockResolvedValue({ content: envelope([edit]), provider: 'local' })
  expect(await seam(scenario)).toEqual([])
})

it.each(['export function useSecuritySettings(): {\n', 'export const value =', 'export const Screen = () => <View>'])(
  'rejects a syntactically incomplete replacement without selecting it: %s', async replacement => {
    const { seam } = setup(envelope([{ ...edit, to: replacement }]))
    const attempts = jest.fn()
    expect(await seam(scenario, attempts)).toEqual([])
    expect(scenario.fixtures[target]).toBe(source)
    expect(attempts.mock.calls[0][0][0]).toMatchObject({ status: 'invalid', selected: false, editApplication: 'rejected' })
    expect(JSON.stringify(attempts.mock.calls)).not.toContain(replacement)
  })

it('rejects ambiguous anchors', async () => {
  const { seam } = setup(envelope([{ ...edit, from: 'keep' }]))
  expect(await seam(scenario)).toEqual([])
})

it('offers unique complete top-level blocks, not nested statements or repeated source', async () => {
  const content = 'keep();\nkeep();\n\nexport function f() {\n  keep();\n}\n'
  const { seam, generate } = setup(envelope([]))
  await seam({ ...scenario, fixtures: { [target]: content } })
  expect(generate.mock.calls[0][0].tools[0].inputSchema.properties.edits.items.properties.from.enum).toEqual(['block-3'])
})

it('rejects unoffered substring anchors even when unique and provider acknowledged', async () => {
  const { seam } = setup(envelope([{ ...edit, from: 'value = 1' }]))
  expect(await seam(scenario)).toEqual([])
})

it('preserves indentation and line endings when inserting after an offered anchor', async () => {
  const content = '  const value = 1;\r\n  keep();\r\n'
  const { seam } = setup(envelope([{ ...edit, op: 'insert-after', from: 'block-1', to: '\r\n  const next = 2;' }]))
  expect(await seam({ ...scenario, fixtures: { [target]: content } })).toEqual([{ path: target, content: '  const value = 1;\r\n  const next = 2;\r\n  keep();\r\n' }])
})

it('accepts a complete inserted export that references an existing declaration', async () => {
  const addition = '\nexport { value as renamed };'
  const { seam } = setup(envelope([{ ...edit, op: 'insert-after', to: addition }]))
  expect(await seam(scenario)).toEqual([{ path: target, content: source.replace('export const value = 1', 'export const value = 1' + addition) }])
})

it('fails before inference when the source has no unique block', async () => {
  const { seam, generate } = setup(envelope([]))
  await expect(seam({ ...scenario, fixtures: { [target]: 'repeat();\nrepeat();\n\n' } })).rejects.toThrow('unique source block')
  expect(generate).not.toHaveBeenCalled()
})

it('rejects repeated block selections before applying any candidate', async () => {
  const { seam } = setup(envelope([edit, { ...edit, to: 'export const value = 3' }]))
  expect(await seam(scenario)).toEqual([])
  expect(scenario.fixtures[target]).toBe(source)
})

it('replaces a complete multiline declaration and preserves comments and unrelated code', async () => {
  const original = '// retain comment\r\nexport interface Options {\r\n  count: number;\r\n}\r\nexport const keep = true;\r\n'
  const replacement = 'export interface Options {\r\n  count: number;\r\n  enabled: boolean;\r\n}'
  const { seam } = setup(envelope([{ ...edit, from: 'block-1', to: replacement }]))
  expect(await seam({ ...scenario, fixtures: { [target]: original } })).toEqual([{ path: target,
    content: '// retain comment\r\n' + replacement + '\r\nexport const keep = true;\r\n' }])
})

it('refuses malformed original source without leaking its text or invoking a provider', async () => {
  const { seam, generate } = setup(envelope([]))
  await expect(seam({ ...scenario, fixtures: { [target]: 'PRIVATE_INVALID {' } })).rejects.toThrow('parseable')
  expect(generate).not.toHaveBeenCalled()
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
