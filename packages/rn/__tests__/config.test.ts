import { getConfig, setConfig, resetConfig } from '../src/config'
import { useTempConfig, cleanup } from './helpers/tmp'

describe('config', () => {
  let dir: string

  beforeEach(() => {
    dir = useTempConfig()
    resetConfig()
  })

  afterEach(() => {
    resetConfig()
    cleanup(dir)
  })

  it('returns schema defaults for unset keys', () => {
    expect(getConfig('modelProvider')).toBe('local')
    expect(getConfig('agentProtocol')).toBe('mcp')
    expect(getConfig('learningEnabled')).toBe(true)
  })

  it('round-trips values through set and get', () => {
    setConfig('projectRoot', '/tmp/project')
    expect(getConfig('projectRoot')).toBe('/tmp/project')
  })

  it('stores object config', () => {
    setConfig('modelConfig', { apiKey: 'sk-x', modelName: 'gpt-4o' })
    expect(getConfig('modelConfig')).toEqual({ apiKey: 'sk-x', modelName: 'gpt-4o' })
  })

  it('reset restores defaults', () => {
    setConfig('modelProvider', 'openai')
    resetConfig()
    expect(getConfig('modelProvider')).toBe('local')
  })
})
