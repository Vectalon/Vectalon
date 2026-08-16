import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { modeOfProvider, modeAllows, isDeploymentMode, MODES, MODE_IDS, MODE_PROVIDERS, MODE_DEFAULT_PROVIDER, verifyMode, describeProvider } from '../../src/model/mode'

describe('vc mode — classification', () => {
  it('maps providers to the privacy ladder', () => {
    expect(modeOfProvider('local')).toBe('air-gapped')
    expect(modeOfProvider('wasm')).toBe('air-gapped')
    expect(modeOfProvider('ollama')).toBe('private')
    expect(modeOfProvider('vllm')).toBe('private')
    expect(modeOfProvider('openai')).toBe('cloud')
    expect(modeOfProvider('anthropic')).toBe('cloud')
    expect(modeOfProvider('azure-openai')).toBe('cloud')
    expect(modeOfProvider('groq')).toBe('cloud')
  })

  it('enforces the allowed sets per mode', () => {
    // Air-gapped: only local + wasm.
    expect(modeAllows('air-gapped', 'local')).toBe(true)
    expect(modeAllows('air-gapped', 'wasm')).toBe(true)
    expect(modeAllows('air-gapped', 'ollama')).toBe(false)
    expect(modeAllows('air-gapped', 'openai')).toBe(false)
    // Private: local infra only.
    expect(modeAllows('private', 'ollama')).toBe(true)
    expect(modeAllows('private', 'vllm')).toBe(true)
    expect(modeAllows('private', 'local')).toBe(true)
    expect(modeAllows('private', 'openai')).toBe(false)
    // Cloud: everything is allowed (hosted is the loosest).
    expect(modeAllows('cloud', 'openai')).toBe(true)
    expect(modeAllows('cloud', 'groq')).toBe(true)
    expect(modeAllows('cloud', 'local')).toBe(true)
  })

  it('recognizes valid mode ids only', () => {
    expect(isDeploymentMode('cloud')).toBe(true)
    expect(isDeploymentMode('private')).toBe(true)
    expect(isDeploymentMode('air-gapped')).toBe(true)
    expect(isDeploymentMode('hybrid')).toBe(false)
    expect(isDeploymentMode('')).toBe(false)
  })

  it('every mode has a default provider inside its own set', () => {
    for (const id of MODE_IDS) {
      expect(MODE_PROVIDERS[id]).toContain(MODE_DEFAULT_PROVIDER[id])
      expect(MODES[id].recommended).toBe(MODE_DEFAULT_PROVIDER[id])
    }
  })
})

describe('vc mode — verification', () => {
  function project(manifest: Record<string, unknown> | null): string {
    const root = mkdtempSync(join(tmpdir(), 'vectalon-mode-'))
    if (manifest) {
      mkdirSync(join(root, '.vectalon'), { recursive: true })
      writeFileSync(join(root, '.vectalon', 'rn-vectalon.json'), JSON.stringify(manifest))
    }
    return root
  }

  it('defaults to air-gapped + local when uninitialized (the safest reading)', () => {
    const root = project(null)
    const result = verifyMode(root)
    expect(result.mode).toBe('air-gapped')
    expect(result.provider).toBe('local')
    expect(result.compliant).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('verifies a compliant provider inside the declared mode', () => {
    const root = project({ name: 'x', modelProvider: 'ollama', deploymentMode: 'private' })
    const result = verifyMode(root)
    expect(result.compliant).toBe(true)
    expect(result.dataflow).toContain('company-controlled')
    rmSync(root, { recursive: true, force: true })
  })

  it('flags a provider outside the declared mode', () => {
    const root = project({ name: 'x', modelProvider: 'openai', deploymentMode: 'air-gapped' })
    const result = verifyMode(root)
    expect(result.compliant).toBe(false)
    expect(result.violation).toContain('not allowed in air-gapped mode')
    expect(result.violation).toContain('local, wasm')
    rmSync(root, { recursive: true, force: true })
  })

  it('describes local/wasm as on-machine and hosted as third-party', () => {
    expect(describeProvider('local')).toContain('this machine')
    expect(describeProvider('wasm')).toContain('this machine')
    expect(describeProvider('ollama')).toContain('company-controlled')
    expect(describeProvider('vllm')).toContain('company-controlled')
    expect(describeProvider('openai')).toContain('hosted model API')
  })
})
