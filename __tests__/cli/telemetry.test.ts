import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { telemetryCommand } from '../../src/cli/commands/telemetry'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../helpers/tmp'

const SENTRY_CRASH = JSON.stringify({
  event_id: 'cli-crash-1',
  message: 'TypeError: undefined is not an object',
  release: '1.2.3',
  exception: {
    values: [{ type: 'TypeError', value: 'undefined is not an object', stacktrace: { frames: [{ filename: 'src/Home.tsx', function: 'Home', lineno: 12, in_app: true }] } }],
  },
})

describe('telemetryCommand', () => {
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
    await expect(telemetryCommand(dir, {})).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('ingests from the default .vectalon/telemetry directory and analyzes', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })
    writeFileSync(join(telemetryDir, 'crash.json'), SENTRY_CRASH)

    await expect(telemetryCommand(dir, {})).resolves.toBeUndefined()

    const store = new ArtifactStore(dir)
    expect(store.findByType('telemetry').length).toBeGreaterThan(0)
  })

  it('ingests from an explicit --path', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const exportsDir = join(dir, 'exports')
    mkdirSync(exportsDir, { recursive: true })
    writeFileSync(join(exportsDir, 'crash.json'), SENTRY_CRASH)

    await expect(telemetryCommand(dir, { path: 'exports' })).resolves.toBeUndefined()
    expect(new ArtifactStore(dir).findByType('telemetry')).toHaveLength(1)
  })

  it('warns (without failing) when no exports are found', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    await expect(telemetryCommand(dir, {})).resolves.toBeUndefined()
    expect(new ArtifactStore(dir).findByType('telemetry')).toHaveLength(0)
  })
})
