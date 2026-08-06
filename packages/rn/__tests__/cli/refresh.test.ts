import { mkdirSync } from 'fs'
import { join } from 'path'
import { refreshCommand } from '../../src/cli/commands/refresh'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('refreshCommand', () => {
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

    await expect(refreshCommand(dir, {})).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('refreshes knowledge and reports suggestions with --force', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    process.env.RN_VECTALON_STUB_FETCH = '1'

    await expect(refreshCommand(dir, { force: true })).resolves.toBeUndefined()

    delete process.env.RN_VECTALON_STUB_FETCH
  })
})
