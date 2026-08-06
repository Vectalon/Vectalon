import { mkdirSync } from 'fs'
import { join } from 'path'
import { bundleCommand } from '../../src/cli/commands/bundle'
import { createTempProject, cleanup } from '../helpers/tmp'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: () => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false }),
}))

describe('bundleCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0', lodash: '^4.17.21' },
        devDependencies: {},
      }),
    })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('exits when the project has not been initialized', async () => {
    const uninitialized = createTempProject({ 'package.json': '{}' })
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    try {
      await expect(bundleCommand(uninitialized, {})).rejects.toThrow('exit')
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      cleanup(uninitialized)
    }
  })

  it('runs static checks without a Metro build with --static', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => true)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => true)
    const success = jest.spyOn(console, 'debug').mockImplementation(() => true)

    await expect(bundleCommand(dir, { static: true })).resolves.toBeUndefined()

    info.mockRestore()
    warn.mockRestore()
    success.mockRestore()
  })

  it('falls back to static checks when the Metro build is unavailable', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => true)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => true)

    // No entry file / react-native in this temp project → runMetroBundleCommand
    // returns null and the command reports static-only.
    await expect(bundleCommand(dir, {})).resolves.toBeUndefined()

    info.mockRestore()
    warn.mockRestore()
  })
})
