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

    const outcome = await telemetryCommand(dir, {})
    expect(outcome.status).toBe('ingested')
    if (outcome.status === 'ingested') {
      expect(outcome.result.crashes).toHaveLength(1)
    }

    const store = new ArtifactStore(dir)
    expect(store.findByType('telemetry').length).toBeGreaterThan(0)
  })

  it('ingests from an explicit --path', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const exportsDir = join(dir, 'exports')
    mkdirSync(exportsDir, { recursive: true })
    writeFileSync(join(exportsDir, 'crash.json'), SENTRY_CRASH)

    const outcome = await telemetryCommand(dir, { path: 'exports' })
    expect(outcome.status).toBe('ingested')
    expect(new ArtifactStore(dir).findByType('telemetry')).toHaveLength(1)
  })

  it('reports empty (no-dir-found) when no exports are found', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const outcome = await telemetryCommand(dir, {})
    expect(outcome).toEqual({ status: 'empty', reason: 'no-dir-found' })
    expect(new ArtifactStore(dir).findByType('telemetry')).toHaveLength(0)
  })

  it('reports empty (no-parseable-events) when files exist but nothing parses', async () => {
    mkdirSync(join(dir, '.vectalon', 'telemetry'), { recursive: true })
    writeFileSync(join(dir, '.vectalon', 'telemetry', 'odd.json'), JSON.stringify({ foo: 1 }))

    const outcome = await telemetryCommand(dir, {})
    expect(outcome).toEqual({ status: 'empty', reason: 'no-parseable-events' })
  })

  it('--fixtures writes sample exports and ingests them end-to-end', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const outcome = await telemetryCommand(dir, { fixtures: true })

    expect(outcome.status).toBe('ingested')
    if (outcome.status === 'ingested') {
      expect(outcome.result.filesScanned).toBe(4)
      expect(outcome.result.events).toHaveLength(6)
      expect(outcome.result.crashes).toHaveLength(2)
      expect(outcome.result.traces).toHaveLength(1)
      expect(outcome.result.analytics).toHaveLength(3)
    }
  })

  it('--formats prints the guide without touching the store', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const outcome = await telemetryCommand(dir, { formats: true })
    expect(outcome).toEqual({ status: 'formats' })
    expect(new ArtifactStore(dir).findByType('telemetry')).toHaveLength(0)
  })

  it('exits on an invalid --format value', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    await expect(telemetryCommand(dir, { format: 'nope' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('--watch combined with --fixtures exits 1 (they are mutually exclusive)', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    await expect(telemetryCommand(dir, { watch: true, fixtures: true })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('--watch reports empty (no-dir-found) when the telemetry directory does not exist', async () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    const outcome = await telemetryCommand(dir, { watch: true })
    expect(outcome).toEqual({ status: 'empty', reason: 'no-dir-found' })
  })
})
