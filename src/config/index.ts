import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { reportError } from '../utils/safe'

const DEFAULTS: Record<string, unknown> = {
  modelProvider: 'local',
  modelConfig: {},
  agentProtocol: 'mcp',
  autoScan: true,
  learningEnabled: true,
  sdlcModules: ['component-gen', 'test-writer', 'debug-analyzer', 'lint-fixer'],
  embeddingProvider: 'hash',
}

function configDir(): string {
  return process.env.RN_VECTALON_CONFIG_DIR || join(homedir(), '.config', 'rn-vectalon')
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

let cache: Record<string, unknown> | null = null

function load(): Record<string, unknown> {
  if (cache) return cache
  try {
    if (existsSync(configPath())) {
      cache = JSON.parse(readFileSync(configPath(), 'utf-8'))
    }
  } catch (err) {
    reportError(err, 'config: reading user config')
  }
  cache = cache || {}
  return cache
}

function save(): void {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(cache, null, 2))
}

export function getConfig(key: string): unknown {
  const data = load()
  return key in data ? data[key] : DEFAULTS[key]
}

export function setConfig(key: string, value: unknown): void {
  const data = load()
  data[key] = value
  save()
}

export function resetConfig(): void {
  cache = null
  rmSync(configDir(), { recursive: true, force: true })
}
