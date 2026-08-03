import { LocalProvider } from '../../src/model/providers/LocalProvider'
import { createChatSessionOptions } from '../../src/model/local/inference'

describe('LocalProvider', () => {
  it('is not ready before initialization', () => {
    const provider = new LocalProvider()
    expect(provider.isReady()).toBe(false)
  })

  it('generates a deterministic fallback when no model is downloaded', async () => {
    const provider = new LocalProvider()
    const response = await provider.generate({
      prompt: 'hello',
      systemPrompt: 'be concise',
      context: 'project ctx',
    })
    expect(response.content).toContain('hello')
    expect(response.content).toContain('be concise')
    expect(response.content).toContain('project ctx')
    expect(response.content).toContain('Local model fallback')
    expect(response.provider).toBe('local')
  })

  it('becomes ready after the first generate', async () => {
    const provider = new LocalProvider()
    await provider.generate({ prompt: 'hi' })
    expect(provider.isReady()).toBe(true)
  })
})

describe('createChatSessionOptions', () => {
  it('forwards the systemPrompt to the chat session constructor (root-cause fix for local intent detection)', () => {
    const options = createChatSessionOptions('seq-1', 'Return ONLY JSON. Schema: ...')
    expect(options).toEqual({ contextSequence: 'seq-1', systemPrompt: 'Return ONLY JSON. Schema: ...' })
  })

  it('passes an undefined systemPrompt through without inventing one', () => {
    const options = createChatSessionOptions('seq-2', undefined)
    expect(options.contextSequence).toBe('seq-2')
    expect(options.systemPrompt).toBeUndefined()
  })
})
