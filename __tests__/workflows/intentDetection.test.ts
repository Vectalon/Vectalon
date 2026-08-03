import {
  parseIntentPrediction,
  predictIntent,
  getIntent,
  intentTitle,
} from '../../src/workflows/phases/intent'
import { ModelRouter } from '../../src/model/ModelRouter'

function mockRouter(content: string): ModelRouter {
  const router = new ModelRouter()
  jest.spyOn(router, 'generate').mockResolvedValue({ content, provider: 'mock' })
  return router
}

describe('parseIntentPrediction', () => {
  it('parses valid LLM JSON with a single intent', () => {
    const raw = JSON.stringify({
      intents: [{ type: 'fix', area: 'lint', confidence: 0.95, reasoning: 'lint violations reported' }],
      reasoning: 'repair request',
    })
    const parsed = parseIntentPrediction(raw)
    expect(parsed?.intent).toEqual({ type: 'fix', area: 'lint', description: '' })
    expect(parsed?.source).toBe('llm')
    expect(parsed?.reasoning).toBe('repair request')
  })

  it('parses fenced JSON blocks', () => {
    const parsed = parseIntentPrediction('```json\n{"intents":[{"type":"add-feature","feature":"login"}]}\n```')
    expect(parsed?.intent).toEqual({ type: 'add-feature', feature: 'login', description: '' })
  })

  it('picks the highest-confidence intent and keeps alternatives', () => {
    const raw = JSON.stringify({
      intents: [
        { type: 'fix', area: 'lint', confidence: 0.4, reasoning: 'also lint' },
        { type: 'add-feature', feature: 'login', confidence: 0.9, reasoning: 'new screen' },
      ],
    })
    const parsed = parseIntentPrediction(raw)
    expect(parsed?.intent.type).toBe('add-feature')
    expect(parsed?.alternatives).toHaveLength(2)
    expect(parsed?.alternatives[0].intent.type).toBe('add-feature')
    expect(parsed?.alternatives[1].intent.type).toBe('fix')
  })

  it('rejects invalid payloads and unknown enum values', () => {
    expect(parseIntentPrediction('not json')).toBeNull()
    expect(parseIntentPrediction('{"files":[]}')).toBeNull()
    expect(parseIntentPrediction('{"intents":[]}')).toBeNull()
    expect(parseIntentPrediction('{"intents":[{"type":"bogus"}]}')).toBeNull()
    // fix without area still parses (defaults to code)
    expect(parseIntentPrediction('{"intents":[{"type":"fix"}]}')).not.toBeNull()
  })

  it('parses intent JSON wrapped in prose from a small local model', () => {
    const parsed = parseIntentPrediction(
      'Sure! Here is the intent JSON you asked for:\n{"intents":[{"type":"remove-dependency","dependency":"appcenter","confidence":0.95}]}\nHope that helps!'
    )
    expect(parsed?.intent).toEqual({ type: 'remove-dependency', dependency: 'appcenter', description: '' })
  })

  it('infers the intent when the model echoes the schema union verbatim', () => {
    const parsed = parseIntentPrediction(
      '{"intents":[{"type":"add-feature|remove-dependency|refactor|fix|unknown","dependency":"appcenter","confidence":0.9,"reasoning":"remove appcenter"}]}'
    )
    expect(parsed?.intent).toEqual({ type: 'remove-dependency', dependency: 'appcenter', description: '' })
  })

  it('infers add-feature from a populated feature field when type is missing', () => {
    const parsed = parseIntentPrediction('{"intents":[{"feature":"login","confidence":0.9}]}')
    expect(parsed?.intent).toEqual({ type: 'add-feature', feature: 'login', description: '' })
  })
})

describe('predictIntent', () => {
  it('uses the LLM prediction when the model responds with intent JSON', async () => {
    const router = mockRouter(JSON.stringify({ intents: [{ type: 'fix', area: 'tests', confidence: 1, reasoning: 'x' }] }))
    const prediction = await predictIntent(router, { prompt: 'fix the tests', snapshot: null })
    expect(prediction.source).toBe('llm')
    expect(prediction.intent).toEqual({ type: 'fix', area: 'tests', description: '' })
  })

  it('returns the unknown default when the model output is not intent JSON', async () => {
    const router = mockRouter('{"files":[{"path":"src/a.ts","content":"x"}]}')
    const prediction = await predictIntent(router, { prompt: 'fix all lint issues', snapshot: null })
    expect(prediction.source).toBe('llm')
    expect(prediction.intent).toMatchObject({ type: 'unknown' })
    expect(prediction.reasoning).toBe('')
    expect(prediction.alternatives).toEqual([])
  })

  it('repairs a prose-wrapped first response with a corrective retry', async () => {
    const router = new ModelRouter()
    const mock = jest.spyOn(router, 'generate')
    mock.mockResolvedValueOnce({ content: 'The intent is to remove appcenter from the project. Here is my analysis...', provider: 'mock' })
    mock.mockResolvedValueOnce({
      content: '{"intents":[{"type":"remove-dependency","dependency":"appcenter","confidence":0.98,"reasoning":"remove appcenter"}]}',
      provider: 'mock',
    })

    const prediction = await predictIntent(router, { prompt: 'Remove appcenter safely from this project', snapshot: null })
    expect(prediction.intent).toEqual({ type: 'remove-dependency', dependency: 'appcenter', description: '' })
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('does not repair when the first response is already valid JSON', async () => {
    const router = new ModelRouter()
    const mock = jest.spyOn(router, 'generate')
    mock.mockResolvedValueOnce({
      content: '{"intents":[{"type":"remove-dependency","dependency":"appcenter","confidence":0.97}]}',
      provider: 'mock',
    })

    const prediction = await predictIntent(router, { prompt: 'Remove appcenter safely from this project', snapshot: null })
    expect(prediction.intent).toMatchObject({ type: 'remove-dependency', dependency: 'appcenter' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('returns the unknown default on the local-model fallback marker', async () => {
    const router = mockRouter('[Local model fallback: no downloaded model]')
    const prediction = await predictIntent(router, { prompt: 'create a login screen', snapshot: null })
    expect(prediction.intent).toMatchObject({ type: 'unknown' })
  })

  it('returns the unknown default when no model router is available', async () => {
    const prediction = await predictIntent({} as ModelRouter, { prompt: 'create a login screen', snapshot: null })
    expect(prediction.intent).toMatchObject({ type: 'unknown' })
  })

  it('keeps the LLM unknown when the model is uncertain', async () => {
    const router = mockRouter(JSON.stringify({ intents: [{ type: 'unknown', confidence: 0.5, reasoning: 'not sure' }] }))
    const prediction = await predictIntent(router, { prompt: 'fix all lint issues', snapshot: null })
    expect(prediction.intent).toMatchObject({ type: 'unknown' })
    expect(prediction.alternatives).toHaveLength(1)
  })

  it('keeps a low-confidence LLM classification without rule overrides', async () => {
    const router = mockRouter(JSON.stringify({ intents: [{ type: 'add-feature', feature: 'dashboard', confidence: 0.3, reasoning: 'maybe' }] }))
    const prediction = await predictIntent(router, { prompt: 'fix all lint issues', snapshot: null })
    expect(prediction.intent).toMatchObject({ type: 'add-feature', feature: 'dashboard' })
  })

  it('keeps a confident LLM classification as-is', async () => {
    const router = mockRouter(JSON.stringify({ intents: [{ type: 'add-feature', feature: 'dashboard', confidence: 0.95, reasoning: 'new page' }] }))
    const prediction = await predictIntent(router, { prompt: 'fix all lint issues', snapshot: null })
    expect(prediction.intent.type).toBe('add-feature')
  })
})

describe('getIntent', () => {
  it('detects once and memoizes the prediction on the shared outputs', async () => {
    const router = mockRouter(JSON.stringify({ intents: [{ type: 'fix', area: 'lint', confidence: 1 }] }))
    const outputs: Record<string, string> = {}
    const first = await getIntent({ prompt: 'fix all lint issues', snapshot: null, modelRouter: router, outputs })
    const second = await getIntent({ prompt: 'fix all lint issues', snapshot: null, modelRouter: router, outputs })

    expect(first.intent).toEqual({ type: 'fix', area: 'lint', description: '' })
    expect(second.intent).toEqual(first.intent)
    expect(router.generate).toHaveBeenCalledTimes(1)
  })

  it('memoizes unknown results as well', async () => {
    const router = mockRouter('garbage that is not intent JSON')
    const outputs: Record<string, string> = {}
    const first = await getIntent({ prompt: 'create a login screen', snapshot: null, modelRouter: router, outputs })
    const second = await getIntent({ prompt: 'create a login screen', snapshot: null, modelRouter: router, outputs })

    expect(first.intent.type).toBe('unknown')
    // First call fails to parse, so the repair retry fires (still memoized after).
    expect(router.generate).toHaveBeenCalledTimes(2)
    expect(second.intent).toEqual(first.intent)
  })

  it('repairs trailing-comma JSON emitted by small local models', async () => {
    const parsed = parseIntentPrediction(
      '{"intents":[{"type":"remove-dependency","dependency":"appcenter","confidence":0.9,}]}'
    )
    expect(parsed?.intent).toEqual({ type: 'remove-dependency', dependency: 'appcenter', description: '' })
  })

  it('still retries once on prose and falls back to unknown', async () => {
    const router = new ModelRouter()
    const mock = jest.spyOn(router, 'generate')
    mock.mockResolvedValue({ content: 'I do not know what you are asking', provider: 'mock' })

    const prediction = await predictIntent(router, { prompt: 'hello?', snapshot: null })
    expect(prediction.intent.type).toBe('unknown')
    // One repair retry fires (prose can be salvaged), then unknown.
    expect(mock).toHaveBeenCalledTimes(2)
  })
})

describe('intentTitle', () => {
  it('renders titles for every intent type', () => {
    expect(intentTitle({ type: 'add-feature', feature: 'login', description: '' })).toBe('Add feature: login')
    expect(intentTitle({ type: 'remove-dependency', dependency: 'appcenter', description: '' })).toBe('Remove dependency: appcenter')
    expect(intentTitle({ type: 'refactor', target: 'profilescreen', description: '' })).toBe('Refactor: profilescreen')
    expect(intentTitle({ type: 'fix', area: 'lint', description: '' })).toBe('Fix lint issues')
    expect(intentTitle({ type: 'unknown', description: '' })).toBe('Custom request')
  })
})
