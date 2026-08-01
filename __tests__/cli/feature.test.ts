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

import { featureCommand } from '../../src/cli/commands/feature'

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
