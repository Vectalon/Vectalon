import { existsSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

let clackNoteOutput = ''

const mockSpinner = () => ({ start: jest.fn(), stop: jest.fn(), message: jest.fn() })

jest.mock('../../src/utils/dynamicImport', () => ({
  dynamicImport: jest.fn(async () => ({
    intro: jest.fn(),
    outro: jest.fn(),
    spinner: jest.fn(mockSpinner),
    log: { error: jest.fn(), info: jest.fn(), success: jest.fn(), warn: jest.fn() },
    note: jest.fn((message: string) => {
      clackNoteOutput += message + '\n'
    }),
  })),
}))

import { featureCommand, formatUpgradeSuggestions, renderUpgradeSuggestions, formatIntentSummary, formatIntentLabel } from '../../src/cli/commands/feature'
import type { ImprovementSuggestion } from '../../src/knowledge/refresh'
import type { IntentPrediction } from '../../src/workflows/phases/intent'

describe('featureCommand', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    clackNoteOutput = ''
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-native' } }),
      'src/Home.tsx': "import React from 'react'\nconst Home = () => null\nexport default Home\n",
    })
    configDir = useTempConfig()
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('requires .vectalon/ to exist', async () => {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)

    await expect(featureCommand('Login', {})).rejects.toThrow('exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('runs the feature workflow and writes state to disk', async () => {
    await import('../../src/cli/commands/init').then(m => m.initCommand(dir, {}))

    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await featureCommand('Login', { dryRun: true })

    expect(clackNoteOutput).toContain('Workflow: Feature Development')
    expect(clackNoteOutput).toContain('Product Requirements Document')
    expect(clackNoteOutput).toContain('src/services/LoginApi.ts')

    const workflowsDir = join(dir, '.vectalon', 'workflows', 'feature-development')
    expect(existsSync(workflowsDir)).toBe(true)
  })
})

describe('upgrade suggestion rendering', () => {
  const suggestions: ImprovementSuggestion[] = [
    {
      id: 'dep-react-native-0.75.0-1',
      sourceId: 'registry-react-native',
      severity: 'warning',
      library: 'react-native',
      currentVersion: '^0.72.0',
      latestVersion: '0.75.0',
      title: 'react-native is behind latest',
      description: 'Upgrade to pick up fixes.',
      createdAt: 1,
    },
    {
      id: 'dep-expo-52.0.0-1',
      sourceId: 'registry-expo',
      severity: 'error',
      library: 'expo',
      currentVersion: '~50.0.0',
      latestVersion: '52.0.0',
      title: 'expo is behind latest',
      description: 'Upgrade to pick up fixes.',
      createdAt: 1,
    },
  ]

  it('formats suggestions with version ranges and severity', () => {
    expect(formatUpgradeSuggestions(suggestions)).toEqual([
      { severity: 'warning', message: 'react-native: ^0.72.0 → 0.75.0' },
      { severity: 'error', message: 'expo: ~50.0.0 → 52.0.0' },
    ])
  })

  it('falls back to the library name when versions are missing', () => {
    const [{ severity, message }] = formatUpgradeSuggestions([
      { ...suggestions[0], currentVersion: undefined, latestVersion: undefined },
    ])
    expect(severity).toBe('warning')
    expect(message).toBe('react-native')
  })

  it('renders nothing when there are no suggestions', () => {
    const log = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    renderUpgradeSuggestions([], log)
    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).not.toHaveBeenCalled()
  })

  it('routes severity to the matching log method and prints the refresh hint', () => {
    const log = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    renderUpgradeSuggestions(suggestions, log)

    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Upgrade suggestions available (2)'))
    expect(log.warn).toHaveBeenCalledWith('react-native: ^0.72.0 → 0.75.0')
    expect(log.error).toHaveBeenCalledWith('expo: ~50.0.0 → 52.0.0')
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('vectalon refresh --force'))
  })
})

describe('intent summary rendering', () => {
  it('formats an LLM fix prediction with confidence and reasoning', () => {
    const prediction: IntentPrediction = {
      intent: { type: 'fix', area: 'lint', description: '' },
      alternatives: [
        { intent: { type: 'fix', area: 'lint', description: '' }, confidence: 0.95, reasoning: 'lint violations reported' },
      ],
      reasoning: 'The user reported lint violations in the project.',
      source: 'llm',
    }
    const summary = formatIntentSummary(prediction)
    expect(summary).toContain('Detected intent: fix/lint — LLM, confidence 0.95')
    expect(summary).toContain('The user reported lint violations in the project.')
  })

  it('formats a rule-based fallback without confidence', () => {
    const prediction: IntentPrediction = {
      intent: { type: 'add-feature', feature: 'login', description: '' },
      alternatives: [],
      reasoning: '',
      source: 'rules',
    }
    expect(formatIntentSummary(prediction)).toBe('Detected intent: add-feature/login — rules')
  })

  it('labels every intent type', () => {
    expect(formatIntentLabel({ type: 'remove-dependency', dependency: 'appcenter', description: '' })).toBe('remove-dependency/appcenter')
    expect(formatIntentLabel({ type: 'refactor', target: 'home-screen', description: '' })).toBe('refactor/home-screen')
    expect(formatIntentLabel({ type: 'fix', area: 'types', description: '' })).toBe('fix/types')
    expect(formatIntentLabel({ type: 'unknown', description: '' })).toBe('unknown')
  })
})
