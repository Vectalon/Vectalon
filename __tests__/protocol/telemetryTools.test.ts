import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
  }),
}

const SENTRY_CRASH = JSON.stringify({
  event_id: 'sentry-tool-1',
  message: 'TypeError: undefined is not an object',
  release: '1.2.3',
  exception: {
    values: [{ type: 'TypeError', value: 'undefined is not an object', stacktrace: { frames: [{ filename: 'src/Home.tsx', function: 'Home', lineno: 12, in_app: true }] } }],
  },
})

const CRASHLYTICS_LINES = [
  JSON.stringify({ app_info: { app_version: '2.0' }, event: { id: 'cl-tool-1', type: 'crash' }, exception: { reason: 'java.lang.NullPointerException', stackTrace: 'at a.b.c' } }),
  JSON.stringify({ event_name: 'session_start', event_params: [] }),
].join('\n')

describe('MCP telemetry tools', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
    resetConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  function createServer() {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    return new MCPServer(engine, router, 'mcp', new ArtifactStore(dir))
  }

  it('advertises analyze_crash and ingest_telemetry', () => {
    const names = createServer().getToolList().map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['analyze_crash', 'ingest_telemetry']))
  })

  it('analyze_crash parses a sentry crash and returns a data-driven analysis', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'analyze_crash',
      arguments: { crash: SENTRY_CRASH },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('Crash Root Cause Analysis')
    expect(result.content).toContain('sentry-tool-1')
    expect(result.content).toContain('Release: 1.2.3')
    expect(result.content).toContain('Bucket: null-reference')
    expect(result.content).toContain('src/Home.tsx:12')
  })

  it('analyze_crash reads a crash file from disk', async () => {
    const file = join(dir, 'crash.json')
    writeFileSync(file, SENTRY_CRASH)
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'analyze_crash',
      arguments: { crashFile: file },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('sentry-tool-1')
  })

  it('analyze_crash reports gracefully when no crash can be parsed', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'analyze_crash',
      arguments: { crash: '{"event_name":"tap"}' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('No crash event could be parsed')
  })

  it('ingest_telemetry ingests exports, persists artifacts, and links analyses', async () => {
    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })
    writeFileSync(join(telemetryDir, 'sentry.json'), SENTRY_CRASH)
    writeFileSync(join(telemetryDir, 'crashlytics.jsonl'), CRASHLYTICS_LINES)

    const server = createServer()
    const result = await server.handleToolCall({
      id: '1',
      name: 'ingest_telemetry',
      arguments: {},
    })
    expect(result.isError).not.toBe(true)
    const summary = JSON.parse(result.content)
    expect(summary.events).toBe(3)
    expect(summary.crashes).toBe(2)
    expect(summary.analytics).toBe(1)

    const store = new ArtifactStore(dir)
    const telemetry = store.findByType('telemetry')
    expect(telemetry.length).toBeGreaterThanOrEqual(3)
    // Crash analyses are persisted and linked to their crash artifacts.
    const analyses = telemetry.filter(a => a.title.startsWith('Crash Analysis:'))
    expect(analyses.length).toBeGreaterThan(0)
    const linked = telemetry.some(a => a.links.some(l => analyses.some(an => an.id === l)))
    expect(linked).toBe(true)
  })

  it('ingest_telemetry reports when no exports exist', async () => {
    const result = await createServer().handleToolCall({
      id: '1',
      name: 'ingest_telemetry',
      arguments: {},
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContain('No telemetry exports found')
  })

  it('re-ingesting the same exports is a no-op (checksum dedupe)', async () => {
    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })
    writeFileSync(join(telemetryDir, 'sentry.json'), SENTRY_CRASH)

    const server = createServer()
    await server.handleToolCall({ id: '1', name: 'ingest_telemetry', arguments: {} })
    const second = await server.handleToolCall({ id: '2', name: 'ingest_telemetry', arguments: {} })
    const summary = JSON.parse(second.content)
    expect(summary.events).toBe(0)
    expect(summary.skipped).toBe(1)
  })
})
