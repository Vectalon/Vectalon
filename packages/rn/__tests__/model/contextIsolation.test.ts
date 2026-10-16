import { LocalProvider } from '../../src/model/providers/LocalProvider'
import { RemoteProvider } from '../../src/model/providers/RemoteProvider'
import { WasmProvider } from '../../src/model/providers/WasmProvider'
import { setConfig, resetConfig } from '../../src/config'
import { useTempConfig, cleanup } from '../helpers/tmp'

describe('controlled project context isolation', () => {
  const originalFetch = global.fetch
  let configDir: string
  beforeEach(() => {
    configDir = useTempConfig()
    resetConfig()
    setConfig('modelConfig', { apiKey: 'test-key' })
    global.fetch = jest.fn().mockResolvedValue({ ok: true,
      json: async () => ({ choices: [{ message: { content: 'reply' } }] }) })
  })
  afterEach(() => { global.fetch = originalFetch; resetConfig(); cleanup(configDir) })

  it.each(['local', 'remote', 'wasm'])('%s skips every enrichment loader only when explicitly disabled', async kind => {
    const skillsLoader = jest.fn(() => 'skills')
    const memoryLoader = jest.fn(() => 'memory')
    const intelLoader = jest.fn(() => 'intel')
    const options = { projectRoot: configDir, skillsLoader, memoryLoader, intelLoader }
    const provider = kind === 'local' ? new LocalProvider({ ...options, nativeProbe: async () => 'missing' })
      : kind === 'remote' ? new RemoteProvider('openai', {}, options)
        : new WasmProvider({ ...options, loadTransformers: async () => ({
          env: {}, pipeline: async () => async () => [{ generated_text: 'reply' }],
        }) })
    await provider.generate({ prompt: 'task', systemPrompt: 'generic coding task', projectContext: 'disabled' })
    for (const loader of [skillsLoader, memoryLoader, intelLoader]) expect(loader).not.toHaveBeenCalled()
    await provider.generate({ prompt: 'task', systemPrompt: 'generic coding task' })
    for (const loader of [skillsLoader, memoryLoader, intelLoader]) expect(loader).toHaveBeenCalledTimes(1)
  })
})
