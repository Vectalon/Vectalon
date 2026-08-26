import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { policyCommand } from '../../src/cli/commands/policy'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('policyCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      }),
    })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('exits when the project has not been initialized', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(policyCommand(dir, {})).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('creates a default policy with --init', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })

    await policyCommand(dir, { init: true })

    const policyPath = join(dir, '.vectalon', 'policy.json')
    expect(existsSync(policyPath)).toBe(true)
    const policy = JSON.parse(readFileSync(policyPath, 'utf-8'))
    expect(policy.version).toBe(1)
    expect(policy.customRules).toEqual([])
  })

  it('checks a file against the policy with --check', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const filePath = join(dir, 'src', 'bad.ts')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(filePath, 'console.log("debug");', 'utf-8')

    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(policyCommand(dir, { check: filePath })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
