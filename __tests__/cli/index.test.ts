import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { initCommand } from '../../src/cli/commands/init'
import { serveCommand } from '../../src/cli/commands/serve'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

describe('initCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      }),
      '.gitignore': 'node_modules\n',
    })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('scans the project and writes snapshot, context, and manifest files', async () => {
    await initCommand(dir, {})

    expect(existsSync(join(dir, '.vectalon', 'snapshot.json'))).toBe(true)
    expect(existsSync(join(dir, '.vectalon', 'context.md'))).toBe(true)

    const manifest = JSON.parse(readFileSync(join(dir, '.vectalon', 'rn-vectalon.json'), 'utf-8'))
    expect(manifest.projectName).toBe('app')
    expect(manifest.rnVersion).toBe('0.72.0')
  })

  it('does not modify .gitignore', async () => {
    await initCommand(dir, {})
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf-8')
    expect(gitignore).not.toContain('.vectalon/')
    expect(gitignore).toBe('node_modules\n')
  })

  it('warns when the target project does not have react-native in dependencies', async () => {
    const dirNoRN = createTempProject({
      'package.json': JSON.stringify({ name: 'plain-node', version: '1.0.0', dependencies: {} }),
      '.gitignore': 'node_modules\n',
    })
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await initCommand(dirNoRN, {})

    expect(write).toHaveBeenCalledWith(expect.stringContaining('no react-native dependency detected'))
    cleanup(dirNoRN)
  })
})

describe('serveCommand', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject({ 'package.json': '{}' })
    configDir = useTempConfig()
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  it('exits with code 1 when the project has not been initialized', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue(dir)
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('exit called') }) as unknown as (code?: string | number | null) => never)

    await expect(serveCommand({})).rejects.toThrow('exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
