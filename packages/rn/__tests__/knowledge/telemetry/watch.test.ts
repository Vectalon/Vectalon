import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  createTelemetryWatcher,
  scanTelemetryFiles,
  readTelemetryWatchState,
  telemetryWatchStatePath,
  renderDeltaSummary,
} from '../../../src/knowledge/telemetry/watch'
import { writeTelemetryFixtures } from '../../../src/knowledge/telemetry/fixtures'
import { ArtifactStore } from '../../../src/knowledge/ArtifactStore'
import type { TelemetryIngestResult } from '../../../src/knowledge/telemetry'
import { createTempProject, cleanup } from '../../helpers/tmp'

const CRASH_1 = JSON.stringify({
  event_id: 'watch-crash-1',
  message: 'TypeError: undefined is not an object',
  release: '2.4.0',
  exception: { values: [{ type: 'TypeError', value: 'undefined is not an object' }] },
})

const CRASH_2 = JSON.stringify({
  event_id: 'watch-crash-2',
  message: 'RangeError: Maximum call stack',
  release: '2.4.1',
  exception: { values: [{ type: 'RangeError', value: 'Maximum call stack size exceeded' }] },
})

describe('scanTelemetryFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('finds telemetry files recursively and skips dotfiles + other extensions', () => {
    const telemetryDir = join(dir, 'telemetry')
    mkdirSync(join(telemetryDir, 'nested'), { recursive: true })
    writeFileSync(join(telemetryDir, 'crash.json'), CRASH_1)
    writeFileSync(join(telemetryDir, 'nested', 'trace.ndjson'), '{}')
    writeFileSync(join(telemetryDir, '.hidden.json'), '{}')
    writeFileSync(join(telemetryDir, 'notes.txt'), 'not telemetry')

    const files = scanTelemetryFiles(telemetryDir)
    expect(files.map((f: string) => f.replace(dir, ''))).toEqual([
      '/telemetry/crash.json',
      '/telemetry/nested/trace.ndjson',
    ])
  })

  it('tolerates a missing directory', () => {
    expect(scanTelemetryFiles(join(dir, 'nope'))).toEqual([])
  })
})

describe('createTelemetryWatcher', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('ingests existing files on the first poll and persists file state', () => {
    writeTelemetryFixtures(dir)

    const watcher = createTelemetryWatcher({ root: dir })
    const delta = watcher.poll()

    expect(delta).not.toBeNull()
    expect(delta!.events).toHaveLength(6)
    expect(delta!.crashes).toHaveLength(2)
    expect(delta!.traces).toHaveLength(1)
    expect(delta!.analytics).toHaveLength(3)
    expect(delta!.changedFiles).toHaveLength(4)

    const state = readTelemetryWatchState(telemetryWatchStatePath(dir))
    expect(Object.keys(state)).toHaveLength(4)
    // Entries are keyed by path relative to the project root.
    expect(state[join('.vectalon', 'telemetry', 'sentry-crash.json')]).toMatchObject({ mtimeMs: expect.any(Number), size: expect.any(Number) })
  })

  it('returns null on a second poll (nothing changed) — no duplicate ingest', () => {
    writeTelemetryFixtures(dir)
    const watcher = createTelemetryWatcher({ root: dir })
    expect(watcher.poll()).not.toBeNull()
    expect(watcher.poll()).toBeNull()

    // The knowledge base holds exactly one artifact per exported event.
    const store = new ArtifactStore(dir)
    expect(store.findByType('telemetry')).toHaveLength(6)
  })

  it('ingests only the file that changed on a later pass', () => {
    writeTelemetryFixtures(dir)
    const watcher = createTelemetryWatcher({ root: dir })
    expect(watcher.poll()).not.toBeNull()

    // Overwrite one crash export with a new event id.
    writeFileSync(join(dir, '.vectalon', 'telemetry', 'sentry-crash.json'), CRASH_2)

    const delta = watcher.poll()
    expect(delta).not.toBeNull()
    expect(delta!.crashes).toHaveLength(1)
    expect(delta!.crashes[0].exceptionType).toBe('RangeError')
    expect(delta!.changedFiles).toEqual([join(dir, '.vectalon', 'telemetry', 'sentry-crash.json')])
    expect(delta!.events).toHaveLength(1)
  })

  it('forgets deleted files so a re-created export re-ingests', () => {
    writeTelemetryFixtures(dir)
    const watcher = createTelemetryWatcher({ root: dir })
    expect(watcher.poll()).not.toBeNull()

    const crashKey = join('.vectalon', 'telemetry', 'sentry-crash.json')
    const crashPath = join(dir, '.vectalon', 'telemetry', 'sentry-crash.json')
    const statePath = telemetryWatchStatePath(dir)
    expect(readTelemetryWatchState(statePath)[crashKey]).toBeDefined()

    rmSync(crashPath)
    expect(watcher.poll()).toBeNull()
    expect(readTelemetryWatchState(statePath)[crashKey]).toBeUndefined()

    // Re-create the file → ingested again (its checksum is new).
    writeFileSync(crashPath, CRASH_1)
    const delta = watcher.poll()
    expect(delta).not.toBeNull()
    expect(delta!.events).toHaveLength(1)
  })

  it('recovers from a corrupt state file without duplicating artifacts', () => {
    writeTelemetryFixtures(dir)
    const watcher = createTelemetryWatcher({ root: dir })
    expect(watcher.poll()).not.toBeNull()

    // Corrupt the state — the next pass treats files as new but the store's
    // content-checksum dedupe prevents duplicates.
    writeFileSync(telemetryWatchStatePath(dir), '{ not json')
    const delta = watcher.poll()
    expect(delta).toBeNull() // everything was already ingested

    const store = new ArtifactStore(dir)
    expect(store.findByType('telemetry')).toHaveLength(6)
    expect(readTelemetryWatchState(telemetryWatchStatePath(dir))[join('.vectalon', 'telemetry', 'sentry-crash.json')]).toBeDefined()
  })

  it('start() runs an initial pass (reporting through onDelta); stop() clears the timer', () => {
    writeTelemetryFixtures(dir)
    const onDelta = jest.fn()
    const watcher = createTelemetryWatcher({ root: dir, intervalMs: 1_000_000, onDelta })
    watcher.start()
    expect(onDelta).toHaveBeenCalledTimes(1)

    expect(existsSync(telemetryWatchStatePath(dir))).toBe(true)
    watcher.stop()
  })

  it('reports deltas through onDelta when wired', () => {
    writeTelemetryFixtures(dir)
    const onDelta = jest.fn()
    const watcher = createTelemetryWatcher({ root: dir, onDelta })
    watcher.poll()
    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDelta.mock.calls[0][0].events).toHaveLength(6)
  })
})

describe('renderDeltaSummary', () => {
  it('renders compact counts + top crashes/traces/analytics', () => {
    const delta: TelemetryIngestResult = {
      ingestedAt: Date.now(),
      filesScanned: 2,
      events: [
        { kind: 'crash', id: 'a', source: 'sentry', exceptionType: 'TypeError', message: 'boom', frames: [], release: '1.2.3' },
        { kind: 'crash', id: 'b', source: 'sentry', exceptionType: 'TypeError', message: 'boom', frames: [], release: '1.2.3' },
        { kind: 'performance', name: 'App start', durationMs: 1400, source: 'sentry' },
        { kind: 'analytics', name: 'session_start', source: 'firebase' },
      ],
      crashes: [
        { kind: 'crash', id: 'a', source: 'sentry', exceptionType: 'TypeError', message: 'boom', frames: [], release: '1.2.3' },
        { kind: 'crash', id: 'b', source: 'sentry', exceptionType: 'TypeError', message: 'boom', frames: [], release: '1.2.3' },
      ],
      traces: [{ kind: 'performance', name: 'App start', durationMs: 1400, source: 'sentry' }],
      analytics: [{ kind: 'analytics', name: 'session_start', source: 'firebase' }],
      artifacts: [],
      skipped: 0,
      errors: [],
    }

    const lines = renderDeltaSummary(delta)
    expect(lines[0]).toContain('4 new event(s)')
    expect(lines[0]).toContain('2 crash')
    expect(lines).toContain('  Crash: TypeError (1.2.3) — 2 report(s)')
    expect(lines).toContain('  Trace: App start — 1400 ms')
    expect(lines).toContain('  Analytics: session_start x1')
  })
})
