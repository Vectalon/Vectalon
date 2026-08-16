/**
 * Local model presets — usage tiers (fast/balanced/quality) + RAM auto-select
 * Business Source License 1.1 (BSL-1.1)
 *
 * Week 2 roadmap (2.1/2.2): three usage tiers that map to concrete GGUF model
 * presets, auto-selected from total system RAM so the model choice never needs
 * a thought, and a resolver that turns either a tier id or a model preset id
 * into the model init/bench/pull actually run.
 */
import {
  getPreset,
  getUsagePreset,
  listUsagePresets,
  resolvePresetValue,
  autoSelectUsagePreset,
  autoSelectModelId,
} from '../../src/model/local/presets'

describe('usage presets (fast/balanced/quality)', () => {
  it('ships exactly the three roadmap tiers mapping to 1.5B/3B/7B', () => {
    const tiers = listUsagePresets()
    expect(tiers.map(t => t.id)).toEqual(['fast', 'balanced', 'quality'])
    expect(tiers.map(t => t.modelId)).toEqual([
      'qwen2.5-coder-1.5b',
      'qwen2.5-coder-3b',
      'qwen2.5-coder-7b',
    ])
    expect(tiers.map(t => t.minRamGb)).toEqual([8, 16, 32])
  })

  it('every tier maps to a real model preset', () => {
    for (const tier of listUsagePresets()) {
      expect(getPreset(tier.modelId)).toBeDefined()
    }
  })

  it('auto-selects the highest tier that fits the machine RAM', () => {
    expect(autoSelectUsagePreset(4).id).toBe('fast')
    expect(autoSelectUsagePreset(8).id).toBe('fast')
    expect(autoSelectUsagePreset(12).id).toBe('fast')
    expect(autoSelectUsagePreset(16).id).toBe('balanced')
    expect(autoSelectUsagePreset(24).id).toBe('balanced')
    expect(autoSelectUsagePreset(31).id).toBe('balanced')
    expect(autoSelectUsagePreset(32).id).toBe('quality')
    expect(autoSelectUsagePreset(64).id).toBe('quality')
  })

  it('autoSelectModelId returns the tier’s concrete GGUF model', () => {
    expect(autoSelectModelId(8)).toBe('qwen2.5-coder-1.5b')
    expect(autoSelectModelId(16)).toBe('qwen2.5-coder-3b')
    expect(autoSelectModelId(32)).toBe('qwen2.5-coder-7b')
  })
})

describe('preset resolution', () => {
  it('resolves a usage tier to its model preset', () => {
    expect(resolvePresetValue('balanced')?.id).toBe('qwen2.5-coder-3b')
    expect(resolvePresetValue('quality')?.id).toBe('qwen2.5-coder-7b')
    expect(resolvePresetValue('fast')?.id).toBe('qwen2.5-coder-1.5b')
  })

  it('resolves a raw model preset id (and is undefined for unknown values)', () => {
    expect(resolvePresetValue('qwen2.5-coder-3b')?.id).toBe('qwen2.5-coder-3b')
    expect(resolvePresetValue('qwen2.5-coder-7b')?.id).toBe('qwen2.5-coder-7b')
    expect(resolvePresetValue('gpt-4o')).toBeUndefined()
    expect(resolvePresetValue(undefined)).toBeUndefined()
  })

  it('ships the 7B flagship preset', () => {
    const seven = getPreset('qwen2.5-coder-7b')
    expect(seven).toBeDefined()
    expect(seven!.sizeGb).toBeGreaterThan(4)
    expect(seven!.license).toBe('Apache-2.0')
  })

  it('getUsagePreset returns the tier by id', () => {
    expect(getUsagePreset('quality')?.modelId).toBe('qwen2.5-coder-7b')
    expect(getUsagePreset('nope')).toBeUndefined()
  })
})
