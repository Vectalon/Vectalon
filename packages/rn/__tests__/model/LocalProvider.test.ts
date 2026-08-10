import { LocalProvider } from '../../src/model/providers/LocalProvider'
import { createChatSessionOptions } from '../../src/model/local/inference'
import { createTempProject, cleanup } from '../helpers/tmp'

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

  it('inlines enabled project skills into the system prompt of local generations', async () => {
    const dir = createTempProject({
      '.vectalon/ecosystem.json': JSON.stringify({ enabled: ['expo-router'] }),
      '.vectalon/skills/expo-router/SKILL.md': 'ALWAYS use file-based routes with typed routes enabled.',
    })
    try {
      const provider = new LocalProvider({ projectRoot: dir })
      const response = await provider.generate({
        prompt: 'build a settings screen',
        systemPrompt: 'be concise',
      })
      // No model downloaded -> fallback echoes the (enriched) system prompt.
      expect(response.content).toContain('be concise')
      expect(response.content).toContain('## Enabled project skills (best practices)')
      expect(response.content).toContain('ALWAYS use file-based routes with typed routes enabled.')
    } finally {
      cleanup(dir)
    }
  })

  it('inlines cached web intel into the system prompt of local generations', async () => {
    // The intel cache is exactly what `vectalon refresh` / the serve
    // background loop writes — so the local model really reaches the
    // auto-refreshed web knowledge.
    const dir = createTempProject({
      '.vectalon/knowledge/refresh/intel.json': JSON.stringify({
        version: 1,
        lastRefreshAt: Date.now(),
        items: [
          { sourceId: 'rn-releases', sourceName: 'RN Releases', title: 'React Native 0.82 released', url: 'https://github.com/facebook/react-native/releases', publishedAt: '2026-08-03T00:00:00Z', fetchedAt: Date.now() },
        ],
      }),
    })
    try {
      const provider = new LocalProvider({ projectRoot: dir })
      const response = await provider.generate({
        prompt: 'build a settings screen',
        systemPrompt: 'be concise',
      })
      // No model downloaded -> fallback echoes the (enriched) system prompt.
      expect(response.content).toContain('be concise')
      expect(response.content).toContain('## Latest React Native ecosystem intel')
      expect(response.content).toContain('React Native 0.82 released')
    } finally {
      cleanup(dir)
    }
  })

  it('uses an injected skills loader when provided', async () => {
    const provider = new LocalProvider({
      projectRoot: '/tmp/irrelevant',
      // Mirrors the real loader contract: base system prompt + appended skills.
      skillsLoader: (root, systemPrompt) => `${systemPrompt}\n\n## Injected skills\n\nCUSTOM SKILL GUIDANCE`,
    })
    const response = await provider.generate({ prompt: 'hi', systemPrompt: 'base' })
    expect(response.content).toContain('CUSTOM SKILL GUIDANCE')
    expect(response.content).toContain('base')
  })

  it('uses an injected memory loader when provided', async () => {
    const provider = new LocalProvider({
      projectRoot: '/tmp/irrelevant',
      // Mirrors the real loader contract: base system prompt + appended memory.
      memoryLoader: (root, systemPrompt) => `${systemPrompt}\n\n## Project memory\n\n- Convention: PascalCase components`,
    })
    const response = await provider.generate({ prompt: 'hi', systemPrompt: 'base' })
    expect(response.content).toContain('## Project memory')
    expect(response.content).toContain('- Convention: PascalCase components')
    expect(response.content).toContain('base')
  })

  it('does not load skills without a projectRoot', async () => {
    const provider = new LocalProvider()
    const response = await provider.generate({ prompt: 'hi', systemPrompt: 'base' })
    expect(response.content).toContain('base')
    expect(response.content).not.toContain('## Enabled project skills (best practices)')
  })

  it('defaults to the shared RN-coder system prompt when none is provided', async () => {
    const provider = new LocalProvider()
    const response = await provider.generate({ prompt: 'hello' })
    // No model downloaded -> fallback echoes the resolved system prompt, which
    // must now be the RN-focused default (was previously undefined).
    expect(response.content).toContain('You are a senior React Native engineer.')
    expect(response.content).toContain('Use StyleSheet.create for styles; never inline style objects.')
  })

  it('prefers a caller-provided system prompt over the default', async () => {
    const provider = new LocalProvider()
    const response = await provider.generate({ prompt: 'hello', systemPrompt: 'custom guidance' })
    expect(response.content).toContain('custom guidance')
    expect(response.content).not.toContain('You are a senior React Native engineer.')
  })

  it('resolves an unknown preset override to the default preset', async () => {
    const provider = new LocalProvider({ presetId: 'not-a-real-preset' })
    // No model downloaded -> fallback echoes the resolved system prompt; the
    // preset resolution itself must not throw and must not invent a model.
    const response = await provider.generate({ prompt: 'hello' })
    expect(response.content).toContain('Local model fallback')
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
