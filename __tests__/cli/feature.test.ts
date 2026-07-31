import { existsSync } from 'fs'
import { join } from 'path'
import { featureCommand } from '../../src/cli/commands/feature'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

describe('featureCommand', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
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

    let stdout = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk)
      return true
    })

    await featureCommand('Login', {})

    expect(stdout).toContain('Workflow: Feature Development')
    expect(stdout).toContain('Product Requirements Document')
    expect(stdout).toContain('src/services/LoginApi.ts')

    const workflowsDir = join(dir, '.vectalon', 'workflows', 'feature-development')
    expect(existsSync(workflowsDir)).toBe(true)
  })
})
