import Conf from 'conf'

const store = new Conf({
  projectName: 'rn-vectalon',
  schema: {
    projectRoot: { type: 'string' },
    modelProvider: { type: 'string', default: 'local' },
    modelConfig: { type: 'object', default: {} },
    agentProtocol: { type: 'string', default: 'mcp' },
    autoScan: { type: 'boolean', default: true },
    learningEnabled: { type: 'boolean', default: true },
    sdlcModules: {
      type: 'array',
      items: { type: 'string' },
      default: ['component-gen', 'test-writer', 'debug-analyzer', 'lint-fixer'],
    },
  },
})

export function getConfig(key: string): unknown {
  return store.get(key)
}

export function setConfig(key: string, value: unknown): void {
  store.set(key, value)
}

export function resetConfig(): void {
  store.clear()
}

export { store }
