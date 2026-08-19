import { createRnHarness } from '../../src/coreHarness/createRnHarness'
import type { GuardrailRule } from '../../src/guardrails'

const noSecrets: GuardrailRule = {
  id: 'rn-no-secret',
  name: 'No inline secrets',
  description: 'Keep credentials out of generated React Native code.',
  severity: 'error',
  check: ({ content }) => content.includes('SECRET')
    ? { passed: false, message: 'Move the secret to secure storage', line: 2 }
    : { passed: true },
}

describe('React Native Core harness adapter', () => {
  it('composes and executes RN-owned policy through the public Core harness', async () => {
    const harness = createRnHarness({
      projectRoot: '/customers/acme/mobile',
      rules: [noSecrets],
      project: {
        name: 'mobile', version: '1.0.0', reactNativeVersion: '0.81.0',
        dependencies: { 'react-native': '0.81.0' }, devDependencies: {}, scripts: {},
        platforms: ['ios', 'android'], hasTypeScript: true, hasMetro: true,
        hasExpo: false, tooling: 'rn-cli', expoSdkVersion: '', reactVersion: '19.1.0',
        root: '/customers/acme/mobile',
      },
      clock: () => '2026-08-19T00:00:00.000Z',
    })

    const outcome = await harness.validate([
      { path: 'src/Login.tsx', content: 'const token = "SECRET"\nexport default token' },
    ])

    expect(outcome.results[0]).toMatchObject({ failed: 1, ok: false })
    expect(outcome.results[0].findings[0]).toMatchObject({
      rule: 'No inline secrets', passed: false, line: 2,
    })
    expect(outcome.run.safe.selectedRules).toEqual([
      { id: 'rn-no-secret', provenance: 'system', version: '1.0.0' },
    ])
    expect(JSON.stringify(outcome.run.safe)).not.toContain('/customers/acme')
    expect(JSON.stringify(outcome.run.safe)).not.toContain('SECRET')
  })

  it('uses Core bounded repair and returns only a validated candidate', async () => {
    const generate = jest.fn(async () => ({ content: 'export const token = getSecureToken()\n', provider: 'scripted' }))
    const harness = createRnHarness({
      projectRoot: '/project', rules: [noSecrets],
      project: {
        name: 'mobile', version: '1.0.0', reactNativeVersion: '0.81.0',
        dependencies: { 'react-native': '0.81.0' }, devDependencies: {}, scripts: {},
        platforms: ['android'], hasTypeScript: true, hasMetro: true, hasExpo: false,
        tooling: 'rn-cli', expoSdkVersion: '', reactVersion: '19.1.0', root: '/project',
      },
      modelRouter: { generate },
      clock: () => '2026-08-19T00:00:00.000Z',
    })

    const outcome = await harness.validate(
      [{ path: 'src/Login.tsx', content: 'export const token = "SECRET"' }],
      { maxAttempts: 2 },
    )

    expect(outcome.run.safe).toMatchObject({ status: 'repaired', reason: 'REPAIR_SUCCEEDED', repairCount: 1 })
    expect(outcome.files).toEqual([{ path: 'src/Login.tsx', content: 'export const token = getSecureToken()\n' }])
    expect(outcome.results[0]).toMatchObject({ failed: 0, ok: true })
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
