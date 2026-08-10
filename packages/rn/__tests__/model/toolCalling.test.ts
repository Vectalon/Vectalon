import {
  TOOL_CALL_SCHEMA,
  buildToolCallSystemPrompt,
  parseToolCallOutput,
  runAgentLoop,
  type AgentLoopCall,
} from '../../src/model/toolCalling'
import type { ModelRequest, ModelResponse } from '../../src/model/types'

const TOOLS = [
  { name: 'get_project_context', description: 'Get project context', inputSchema: { type: 'object', properties: {} } },
  { name: 'review_code', description: 'Review a code snippet', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
]

function routerReturning(...responses: string[]): { generate: jest.Mock } {
  let i = 0
  return {
    // Repeat the last response once the queue is exhausted (the iteration-cap
    // test relies on the model never answering).
    generate: jest.fn(async (): Promise<ModelResponse> => {
      const content = responses[Math.min(i, responses.length - 1)] ?? ''
      i++
      return { content, provider: 'local' }
    }),
  }
}

describe('TOOL_CALL_SCHEMA', () => {
  it('is an object schema with tool, arguments, and answer properties', () => {
    expect(TOOL_CALL_SCHEMA.type).toBe('object')
    expect(TOOL_CALL_SCHEMA.properties).toHaveProperty('tool')
    expect(TOOL_CALL_SCHEMA.properties).toHaveProperty('arguments')
    expect(TOOL_CALL_SCHEMA.properties).toHaveProperty('answer')
  })
})

describe('buildToolCallSystemPrompt', () => {
  it('lists every tool with its description and schema', () => {
    const prompt = buildToolCallSystemPrompt(TOOLS)
    expect(prompt).toContain('get_project_context: Get project context')
    expect(prompt).toContain('review_code')
    expect(prompt).toContain('inputSchema')
    expect(prompt).toContain('"required":["code"]')
  })
})

describe('parseToolCallOutput', () => {
  it('parses a tool call', () => {
    expect(parseToolCallOutput('{"tool":"review_code","arguments":{"code":"x"}}')).toEqual({
      kind: 'tool-call',
      tool: 'review_code',
      arguments: { code: 'x' },
    })
  })

  it('parses a tool call wrapped in a json code fence', () => {
    const parsed = parseToolCallOutput('```json\n{"tool":"get_project_context","arguments":{}}\n```')
    expect(parsed.kind).toBe('tool-call')
    if (parsed.kind === 'tool-call') expect(parsed.tool).toBe('get_project_context')
  })

  it('parses a final answer', () => {
    expect(parseToolCallOutput('{"answer":"all done"}')).toEqual({ kind: 'answer', text: 'all done' })
  })

  it('defaults missing arguments to an empty object', () => {
    const parsed = parseToolCallOutput('{"tool":"get_project_context"}')
    expect(parsed).toEqual({ kind: 'tool-call', tool: 'get_project_context', arguments: {} })
  })

  it('rejects garbage, empty, and invalid JSON', () => {
    expect(parseToolCallOutput('hello world').kind).toBe('invalid')
    expect(parseToolCallOutput('').kind).toBe('invalid')
    expect(parseToolCallOutput('{nope}').kind).toBe('invalid')
    expect(parseToolCallOutput('{"foo":1}').kind).toBe('invalid')
  })
})

describe('runAgentLoop', () => {
  it('executes a tool call and returns the model answer', async () => {
    const router = routerReturning(
      '{"tool":"get_project_context","arguments":{}}',
      '{"answer":"the project uses react-native"}'
    )
    const execute = jest.fn(async (name: string) => `result-of-${name}`)

    const result = await runAgentLoop({ modelRouter: router, prompt: 'what is the project?', tools: TOOLS, execute })

    expect(result.answer).toBe('the project uses react-native')
    expect(result.iterations).toBe(2)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0]).toMatchObject({ tool: 'get_project_context', arguments: {} })
    expect(execute).toHaveBeenCalledWith('get_project_context', {})
    // The tool result was fed back into the follow-up prompt.
    const followUp = router.generate.mock.calls[1][0] as ModelRequest
    expect(followUp.prompt).toContain('result-of-get_project_context')
    expect(followUp.tools).toBe(TOOLS)
  })

  it('feeds back the full call history for multi-step plans', async () => {
    const router = routerReturning(
      '{"tool":"get_project_context","arguments":{}}',
      '{"tool":"review_code","arguments":{"code":"use result A"}}',
      '{"answer":"done after A and B"}'
    )
    const execute = jest.fn(async (name: string, args: Record<string, unknown>) =>
      name === 'get_project_context' ? 'RESULT-A' : `saw: ${JSON.stringify(args)}`
    )

    const result = await runAgentLoop({ modelRouter: router, prompt: 'plan', tools: TOOLS, execute })
    expect(result.answer).toBe('done after A and B')
    expect(result.iterations).toBe(3)
    expect(result.calls).toHaveLength(2)

    // The second continuation prompt retains RESULT-A from the first call.
    const secondContinuation = router.generate.mock.calls[2][0] as ModelRequest
    expect(secondContinuation.prompt).toContain('RESULT-A')
    expect(secondContinuation.prompt).toContain('### Tool: get_project_context')
    // Tool output is framed as untrusted data.
    expect(secondContinuation.prompt).toContain('unverified tool output')
  })

  it('returns immediately when the model answers first', async () => {
    const router = routerReturning('{"answer":"no tools needed"}')
    const execute = jest.fn()

    const result = await runAgentLoop({ modelRouter: router, prompt: 'hi', tools: TOOLS, execute })
    expect(result.answer).toBe('no tools needed')
    expect(result.iterations).toBe(1)
    expect(result.calls).toHaveLength(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it('stops when the model requests an unknown tool', async () => {
    const router = routerReturning('{"tool":"not_a_real_tool","arguments":{}}')
    const execute = jest.fn()

    const result = await runAgentLoop({ modelRouter: router, prompt: 'go', tools: TOOLS, execute })
    expect(result.answer).toContain('unknown tool')
    expect(result.calls).toHaveLength(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it('forces a final answer pass when the model never answers (no opaque cap)', async () => {
    const router = routerReturning(
      '{"tool":"review_code","arguments":{"code":"a"}}',
      '{"tool":"review_code","arguments":{"code":"b"}}',
      '{"tool":"review_code","arguments":{"code":"c"}}',
      '{"answer":"forced answer from history"}'
    )
    const execute = jest.fn(async () => 'ok')

    const result = await runAgentLoop({ modelRouter: router, prompt: 'loop', tools: TOOLS, execute, maxIterations: 3 })
    // The budget (3 rounds) was consumed by tool calls; the loop then ran ONE
    // extra final-answer generation instead of returning a cap message.
    expect(result.answer).toBe('forced answer from history')
    expect(result.calls).toHaveLength(3)
    expect(execute).toHaveBeenCalledTimes(3)
    // The final pass asked for an answer, not another tool call.
    const finalPass = router.generate.mock.calls[3][0] as ModelRequest
    expect(finalPass.prompt).toContain('unverified tool output')
    expect(finalPass.systemPrompt).toContain('Do NOT call any tool')
  })

  it('reports the raw output when the forced answer pass is also unparseable', async () => {
    const router = routerReturning(
      '{"tool":"review_code","arguments":{"code":"a"}}',
      '{"tool":"review_code","arguments":{"code":"b"}}',
      'still not json'
    )
    const execute = jest.fn(async () => 'ok')

    const result = await runAgentLoop({ modelRouter: router, prompt: 'loop', tools: TOOLS, execute, maxIterations: 2 })
    expect(result.answer).toContain('ran out of tool-call budget')
    expect(result.answer).toContain('still not json')
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('skips repeated read-only tool calls and nudges the model to answer', async () => {
    const router = routerReturning(
      '{"tool":"get_project_context","arguments":{}}',
      '{"tool":"get_project_context","arguments":{}}',
      '{"answer":"the project uses react-native"}'
    )
    const execute = jest.fn(async (name: string) => `result-of-${name}`)

    const result = await runAgentLoop({ modelRouter: router, prompt: 'what is the project?', tools: TOOLS, execute })
    expect(result.answer).toBe('the project uses react-native')
    // Only ONE real execution — the repeat was skipped, not re-run.
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.calls).toHaveLength(2)
    expect(result.calls[1].result).toContain('already called')
    // The skip notice went back to the model.
    const followUp = router.generate.mock.calls[2][0] as ModelRequest
    expect(followUp.prompt).toContain('Do not call it again')
  })

  it('caps total tool calls per run with a forced final answer', async () => {
    const router = routerReturning(
      '{"tool":"review_code","arguments":{"code":"a"}}',
      '{"tool":"review_code","arguments":{"code":"b"}}',
      '{"tool":"review_code","arguments":{"code":"c"}}',
      '{"answer":"budget reached"}'
    )
    const execute = jest.fn(async () => 'ok')

    const result = await runAgentLoop({ modelRouter: router, prompt: 'loop', tools: TOOLS, execute, maxToolCalls: 2 })
    expect(result.answer).toBe('budget reached')
    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.calls).toHaveLength(2)
  })

  it('feeds tool errors back to the model', async () => {
    const router = routerReturning('{"tool":"review_code","arguments":{}}', '{"answer":"saw the error"}')
    const execute = jest.fn(async () => {
      throw new Error('boom')
    })

    const result = await runAgentLoop({ modelRouter: router, prompt: 'x', tools: TOOLS, execute })
    expect(result.answer).toBe('saw the error')
    expect((result.calls[0] as AgentLoopCall).result).toContain('Error: boom')
    const followUp = router.generate.mock.calls[1][0] as ModelRequest
    expect(followUp.prompt).toContain('Error: boom')
  })

  it('reports unparseable model output', async () => {
    const router = routerReturning('this is not JSON at all')
    const execute = jest.fn()

    const result = await runAgentLoop({ modelRouter: router, prompt: 'x', tools: TOOLS, execute })
    expect(result.answer).toContain('parseable tool call or answer')
    expect(result.answer).toContain('this is not JSON')
    expect(execute).not.toHaveBeenCalled()
  })
})
