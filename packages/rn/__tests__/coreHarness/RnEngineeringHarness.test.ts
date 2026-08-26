import { createRnHarness, discoverRnProject } from '../../src/coreHarness/createRnHarness'
import type { GuardrailRule } from '../../src/guardrails'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

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
  it.each([
    {
      name: 'bare RN', app: '.',
      files: { 'package.json': '{"name":"mobile","dependencies":{"react-native":"0.75.0"}}', 'tsconfig.json': '{}' },
      expected: { reactNativeVersion: '0.75.0', platforms: ['ios', 'android'], hasTypeScript: true },
      features: ['rn-cli'],
    },
    {
      name: 'Expo managed', app: '.',
      files: { 'package.json': '{"name":"mobile","dependencies":{"expo":"53.0.0","react-native":"0.79.0"}}' },
      expected: { hasExpo: true, platforms: ['ios', 'android'], newArchitecture: { enabled: true } },
      features: ['expo', 'new-architecture'],
    },
    {
      name: 'monorepo app', app: 'apps/mobile',
      files: {
        'package.json': '{"private":true,"workspaces":["apps/*"],"dependencies":{"react-native":"0.81.0"}}',
        'tsconfig.json': '{}', 'apps/mobile/package.json': '{"name":"mobile"}',
      },
      expected: { reactNativeVersion: '0.81.0', hasTypeScript: true, workspace: { isMonorepo: true } },
      features: ['rn-cli', 'monorepo'],
    },
    {
      name: 'New Architecture opt-in', app: '.',
      files: { 'package.json': '{"name":"mobile","dependencies":{"react-native":"0.75.0"}}', 'android/gradle.properties': 'newArchEnabled=true' },
      expected: { newArchitecture: { enabled: true } },
      features: ['rn-cli', 'new-architecture'],
    },
    {
      name: 'partially broken', app: '.',
      files: { 'package.json': '{broken' },
      expected: { name: 'react-native-project', reactNativeVersion: '', platforms: [] },
      features: ['rn-cli'],
    },
  ])('discovers and validates a $name project through Core', async ({ app, files, expected, features }) => {
    const root = mkdtempSync(join(tmpdir(), 'rn-core-project-'))
    try {
      for (const [file, content] of Object.entries(files)) {
        const target = join(root, file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content!)
      }
      const projectRoot = join(root, app)
      const project = discoverRnProject(projectRoot)
      expect(project).toMatchObject(expected)
      const harness = createRnHarness({ projectRoot, project, rules: [noSecrets], clock: () => '2026-08-19T00:00:00.000Z' })
      const outcome = await harness.validate([{ path: 'src/App.tsx', content: 'SECRET' }])
      expect(outcome.run.local.project?.features).toEqual(expect.arrayContaining(features))
      expect(outcome.run.safe.status).toBe('blocked')
      expect(outcome.writable).toBe(false)
      expect(JSON.stringify(outcome.run.safe)).not.toContain(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

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

  it('fails closed when an RN rule crashes', async () => {
    const crashing: GuardrailRule = {
      ...noSecrets,
      id: 'rn-crash',
      name: 'Crashing rule',
      check: () => { throw new Error('customer source leaked here') },
    }
    const harness = createRnHarness({
      projectRoot: '/project', rules: [crashing],
      project: {
        name: 'mobile', version: '1.0.0', reactNativeVersion: '0.81.0', dependencies: {},
        devDependencies: {}, scripts: {}, platforms: [], hasTypeScript: true, hasMetro: false,
        hasExpo: false, tooling: 'rn-cli', expoSdkVersion: '', reactVersion: '', root: '/project',
      },
      clock: () => '2026-08-19T00:00:00.000Z',
    })

    const outcome = await harness.validate([{ path: 'src/Private.ts', content: 'private source' }])
    expect(outcome.run.safe.reason).toBe('RULE_EXECUTION_FAILED')
    expect(outcome.results[0]).toMatchObject({ failed: 1, ok: false })
    expect(JSON.stringify(outcome)).not.toContain('customer source leaked here')
  })

  it('threads conventions to RN rules and keeps filenames out of safe evidence', async () => {
    const typedOnly: GuardrailRule = {
      ...noSecrets,
      id: 'rn-typed-only',
      applicable: ({ conventions }) => conventions?.hasTypeScript === true,
      check: () => ({ passed: false, message: 'typed finding' }),
    }
    const harness = createRnHarness({
      projectRoot: '/project', rules: [typedOnly],
      conventions: { hasTypeScript: true },
      project: {
        name: 'mobile', version: '1.0.0', reactNativeVersion: '', dependencies: {}, devDependencies: {},
        scripts: {}, platforms: [], hasTypeScript: true, hasMetro: false, hasExpo: false,
        tooling: 'rn-cli', expoSdkVersion: '', reactVersion: '', root: '/project',
      },
      clock: () => '2026-08-19T00:00:00.000Z',
    })
    const outcome = await harness.validate([{ path: 'src/CustomerLogin.tsx', content: 'safe' }])
    expect(outcome.results[0].failed).toBe(1)
    expect(JSON.stringify(outcome.run.safe)).not.toContain('CustomerLogin')
    expect(outcome.run.safe.runId).not.toContain('CustomerLogin')
  })
})
