import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { TelemetryIngestionService, renderEventMarkdown } from '../../../src/knowledge/telemetry'
import { ArtifactStore } from '../../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../../helpers/tmp'

const SENTRY_CRASH = JSON.stringify({
  event_id: 'sentry-1',
  timestamp: 1700000000,
  message: 'TypeError: undefined is not an object',
  release: '1.2.3',
  exception: {
    values: [{ type: 'TypeError', value: 'undefined is not an object', stacktrace: { frames: [{ filename: 'src/Home.tsx', function: 'Home', lineno: 12, in_app: true }] } }],
  },
})

const CRASHLYTICS_LINES = [
  JSON.stringify({ app_info: { app_version: '2.0' }, event: { id: 'cl-1', type: 'crash' }, exception: { reason: 'java.lang.NullPointerException', stackTrace: 'at a.b.c' } }),
  JSON.stringify({ event_name: 'session_start', event_params: [{ key: 'platform', value: { string_value: 'ios' } }] }),
].join('\n')

describe('TelemetryIngestionService', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({ 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }) })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('ingests a directory of exports into telemetry artifacts', () => {
    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })
    writeFileSync(join(telemetryDir, 'sentry.json'), SENTRY_CRASH)
    writeFileSync(join(telemetryDir, 'crashlytics.jsonl'), CRASHLYTICS_LINES)

    const store = new ArtifactStore(dir)
    const result = new TelemetryIngestionService(store).ingestDirectory(telemetryDir)

    expect(result.filesScanned).toBe(2)
    expect(result.events).toHaveLength(3)
    expect(result.crashes).toHaveLength(2)
    expect(result.analytics).toHaveLength(1)
    expect(result.artifacts.length).toBe(3)
    expect(result.errors).toHaveLength(0)

    const telemetry = store.findByType('telemetry')
    expect(telemetry).toHaveLength(3)
    expect(telemetry[0].title).toContain('Crash:')
  })

  it('dedupes on re-ingest via content checksum', () => {
    const telemetryDir = join(dir, 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })
    writeFileSync(join(telemetryDir, 'sentry.json'), SENTRY_CRASH)

    const store = new ArtifactStore(dir)
    const service = new TelemetryIngestionService(store)

    const first = service.ingestDirectory(telemetryDir)
    expect(first.events).toHaveLength(1)

    const second = service.ingestDirectory(telemetryDir)
    expect(second.events).toHaveLength(0)
    expect(second.skipped).toBe(1)
    expect(store.findByType('telemetry')).toHaveLength(1)
  })

  it('dedupes duplicate crash ids within a single batch', () => {
    const store = new ArtifactStore(dir)
    const service = new TelemetryIngestionService(store)
    const duplicated = `${SENTRY_CRASH}\n${SENTRY_CRASH}\n`
    writeFileSync(join(dir, 'dup.jsonl'), duplicated)

    const result = service.ingestFile(join(dir, 'dup.jsonl'))
    expect(result.events).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })

  it('stores crash metadata (eventId, release, kind, source)', () => {
    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })
    writeFileSync(join(telemetryDir, 'sentry.json'), SENTRY_CRASH)

    const store = new ArtifactStore(dir)
    new TelemetryIngestionService(store).ingestDirectory(telemetryDir)

    const artifact = store.findByType('telemetry')[0]
    expect(artifact.meta.kind).toBe('crash')
    expect(artifact.meta.source).toBe('sentry')
    expect(artifact.meta.eventId).toBe('sentry-1')
    expect(artifact.meta.release).toBe('1.2.3')
  })

  it('findDefaultDir prefers .vectalon/telemetry over telemetry/', () => {
    mkdirSync(join(dir, 'telemetry'), { recursive: true })
    expect(TelemetryIngestionService.findDefaultDir(dir)).toBe(join(dir, 'telemetry'))

    mkdirSync(join(dir, '.vectalon', 'telemetry'), { recursive: true })
    expect(TelemetryIngestionService.findDefaultDir(dir)).toBe(join(dir, '.vectalon', 'telemetry'))
  })

  it('handles missing directories and unparseable files without throwing', () => {
    const store = new ArtifactStore(dir)
    const service = new TelemetryIngestionService(store)

    const missing = service.ingestDirectory(join(dir, 'nope'))
    expect(missing.filesScanned).toBe(0)

    writeFileSync(join(dir, 'bad.json'), '{ not json')
    const bad = service.ingestFile(join(dir, 'bad.json'))
    expect(bad.events).toHaveLength(0)
    expect(bad.errors).toHaveLength(1)
  })

  it('forces a format via options when detection misses an unusual shape', () => {
    const store = new ArtifactStore(dir)
    const service = new TelemetryIngestionService(store)
    writeFileSync(join(dir, 'odd.json'), JSON.stringify({ type: 'crash', reason: 'boom' }))

    const auto = service.ingestFile(join(dir, 'odd.json'))
    expect(auto.events).toHaveLength(0)

    const forced = service.ingestFile(join(dir, 'odd.json'), { format: 'crashlytics' })
    expect(forced.events).toHaveLength(1)
    expect(forced.crashes).toHaveLength(1)
  })

  it('renderEventMarkdown renders each event kind', () => {
    expect(renderEventMarkdown({ kind: 'crash', id: 'x', source: 'sentry', exceptionType: 'TypeError', message: 'boom', frames: [] }))
      .toContain('# Crash: TypeError')
    expect(renderEventMarkdown({ kind: 'performance', name: 'Load', durationMs: 123, source: 'generic' }))
      .toContain('# Performance trace: Load')
    expect(renderEventMarkdown({ kind: 'analytics', name: 'tap', source: 'generic' }))
      .toContain('# Analytics event: tap')
  })
})
