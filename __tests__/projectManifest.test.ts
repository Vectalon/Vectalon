import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readProjectManifest, resolveProjectModelProvider, resolveProjectModelConfig } from '../src/projectManifest'

function writeManifest(dir: string, content: string): void {
  mkdirSync(join(dir, '.vectalon'), { recursive: true })
  writeFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), content)
}

describe('project manifest', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when no manifest exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-manifest-'))
    expect(readProjectManifest(dir)).toBeNull()
    expect(resolveProjectModelProvider(dir)).toBe('local')
    expect(resolveProjectModelConfig(dir)).toBeUndefined()
  })

  it('reads the manifest written by init', () => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-manifest-'))
    writeManifest(
      dir,
      JSON.stringify({
        version: '0.1.0',
        projectName: 'app',
        rnVersion: '0.76.0',
        tooling: 'expo',
        expoSdkVersion: '~52.0.0',
        initializedAt: 1,
        modelProvider: 'anthropic',
        modelConfig: { modelName: 'claude-sonnet-4-20250514', apiKeyEnv: 'ANTHROPIC_API_KEY' },
        autoLearn: true,
      })
    )

    const manifest = readProjectManifest(dir)
    expect(manifest?.projectName).toBe('app')
    expect(manifest?.tooling).toBe('expo')
  })

  it('resolves the provider from the manifest when no CLI flag is given', () => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-manifest-'))
    writeManifest(
      dir,
      JSON.stringify({ modelProvider: 'openai', modelConfig: { modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' } })
    )

    expect(resolveProjectModelProvider(dir)).toBe('openai')
    expect(resolveProjectModelConfig(dir)).toEqual({ modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' })
  })

  it('prefers an explicit CLI flag over the manifest', () => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-manifest-'))
    writeManifest(
      dir,
      JSON.stringify({ modelProvider: 'openai', modelConfig: { modelName: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' } })
    )

    expect(resolveProjectModelProvider(dir, 'local')).toBe('local')
  })

  it('falls back to local for a corrupt manifest', () => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-manifest-'))
    writeManifest(dir, '{ not json')
    expect(readProjectManifest(dir)).toBeNull()
    expect(resolveProjectModelProvider(dir)).toBe('local')
  })
})
