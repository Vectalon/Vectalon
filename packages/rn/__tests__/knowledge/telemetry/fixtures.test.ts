import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { writeTelemetryFixtures, TELEMETRY_FIXTURE_FILES, TelemetryIngestionService } from '../../../src/knowledge/telemetry'
import { ArtifactStore } from '../../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../../helpers/tmp'

describe('telemetry fixtures', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({ 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }) })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('writes one sample export per supported format', () => {
    const written = writeTelemetryFixtures(dir)
    expect(written).toHaveLength(TELEMETRY_FIXTURE_FILES.length)

    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    expect(existsSync(telemetryDir)).toBe(true)
    expect(readdirSync(telemetryDir).sort()).toEqual([...TELEMETRY_FIXTURE_FILES].sort())
    for (const file of written) {
      expect(existsSync(file)).toBe(true)
    }
  })

  it('ingesting the fixtures exercises every parser (2 crashes, 1 trace, 3 analytics)', () => {
    writeTelemetryFixtures(dir)

    const store = new ArtifactStore(dir)
    const result = new TelemetryIngestionService(store).ingestDirectory(join(dir, '.vectalon', 'telemetry'))

    expect(result.filesScanned).toBe(4)
    expect(result.events).toHaveLength(6)
    expect(result.crashes).toHaveLength(2)
    expect(result.traces).toHaveLength(1)
    expect(result.analytics).toHaveLength(3)
    expect(result.errors).toHaveLength(0)
    expect(result.artifacts).toHaveLength(6)
    expect(store.findByType('telemetry')).toHaveLength(6)
  })

  it('re-ingesting fixtures dedupes to zero new artifacts (idempotent demo)', () => {
    writeTelemetryFixtures(dir)

    const store = new ArtifactStore(dir)
    const service = new TelemetryIngestionService(store)
    const first = service.ingestDirectory(join(dir, '.vectalon', 'telemetry'))
    expect(first.artifacts).toHaveLength(6)

    const second = service.ingestDirectory(join(dir, '.vectalon', 'telemetry'))
    expect(second.events).toHaveLength(0)
    expect(second.skipped).toBe(6)
    expect(store.findByType('telemetry')).toHaveLength(6)
  })
})
