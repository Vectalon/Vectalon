import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ciCommand } from '../../src/cli/commands/ci'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('ciCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        scripts: { lint: 'eslint src', test: 'jest' },
        dependencies: { 'react-native': '0.72.0' },
      }),
    })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('generates the GitHub Actions workflow for a bare RN CLI project', async () => {
    await expect(ciCommand(dir, {})).resolves.toBeUndefined()
    expect(existsSync(join(dir, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(true)
  })

  it('generates the EAS workflow for an Expo project', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { test: 'jest' }, dependencies: { expo: '~52.0.0' } }, null, 2)
    )
    await expect(ciCommand(dir, {})).resolves.toBeUndefined()
    expect(existsSync(join(dir, '.eas', 'workflows', 'vectalon.yml'))).toBe(true)
    expect(existsSync(join(dir, '.github', 'workflows', 'vectalon-ci.yml'))).toBe(false)
  })

  it('exits when the project has not been initialized', async () => {
    const uninitialized = join(dir, 'sub')
    mkdirSync(uninitialized, { recursive: true })
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    await expect(ciCommand(uninitialized, {})).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
