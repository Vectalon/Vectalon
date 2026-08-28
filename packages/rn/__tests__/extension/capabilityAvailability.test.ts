import { extensionCommandDecision, extensionCommandLabel } from '../../extension/src/capabilityAvailability'
import extension from '../../extension/package.json'

describe('extension capability boundary', () => {
  it('keeps beta onboarding commands available and labelled', () => {
    expect(extensionCommandDecision('vectalon.checkGuardrails', false)).toEqual({ available: true, reason: 'available' })
    expect(extensionCommandLabel('vectalon.checkGuardrails')).toBe('[beta]')
  })

  it('blocks experimental and unknown handlers unless explicitly opted in', () => {
    expect(extensionCommandDecision('vectalon.archiveBuild', false)).toEqual({ available: false, reason: 'experimental-opt-in-required' })
    expect(extensionCommandDecision('vectalon.archiveBuild', true)).toEqual({ available: true, reason: 'available' })
    expect(extensionCommandDecision('vectalon.notRegistered', true)).toEqual({ available: false, reason: 'unknown-capability' })
  })

  it('projects lifecycle status and enablement into public command contributions', () => {
    const archive = extension.contributes.commands.find((item: { command: string }) => item.command === 'vectalon.archiveBuild')
    const policy = extension.contributes.commands.find((item: { command: string }) => item.command === 'vectalon.checkGuardrails')
    expect(archive).toMatchObject({ title: expect.stringContaining('[experimental]'), enablement: 'config.vectalon.experimentalCapabilities' })
    expect(policy).toMatchObject({ title: expect.stringContaining('[beta]') })
    expect(policy?.enablement).toBeUndefined()
  })
})
