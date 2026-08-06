/**
 * Config types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */

export interface ConfigOptions {
  modelProvider: string
  modelConfig: Record<string, unknown>
  agentProtocol: string
  autoScan: boolean
  learningEnabled: boolean
  sdlcModules: string[]
  embeddingProvider: string
}

export const DEFAULTS: ConfigOptions = {
  modelProvider: 'local',
  modelConfig: {},
  agentProtocol: 'mcp',
  autoScan: true,
  learningEnabled: true,
  sdlcModules: ['component-gen', 'test-writer', 'debug-analyzer', 'lint-fixer'],
  embeddingProvider: 'hash',
}
