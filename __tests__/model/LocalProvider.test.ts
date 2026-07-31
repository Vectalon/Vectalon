import { LocalProvider } from '../../src/model/providers/LocalProvider'

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
