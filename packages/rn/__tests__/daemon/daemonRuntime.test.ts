import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { startDaemon, daemonStatus, readDaemonState, isDaemonRunning } from '../../src/daemon/daemonRuntime'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { telemetryWatchStatePath } from '../../src/knowledge/telemetry/watch'
import { createTempProject, cleanup } from '../helpers/tmp'

const SENTRY_CRASH = JSON.stringify({
  event_id: 'daemon-crash-1',
  message: 'TypeError: undefined is not an object',
  release: '1.2.3',
  exception: {
    values: [{ type: 'TypeError', value: 'undefined is not an object', stacktrace: { frames: [{ filename: 'src/Home.tsx', function: 'Home', lineno: 12, in_app: true }] } }],
  },
})

describe('daemon runtime', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('starts, ingests a Metro event into the knowledge base, and closes cleanly', async () => {
    const { port, close } = await startDaemon(dir, { deviceProbe: false })

    try {
      const state = readDaemonState(dir)
      expect(state).toMatchObject({ port, pid: process.pid })
      expect(isDaemonRunning(dir)).toBe(true)

      // The generated reporter is in place for the next `react-native start`.
      expect(existsSync(join(dir, '.vectalon', 'metro', 'vectalon-reporter.js'))).toBe(true)

      const res = await fetch(`http://127.0.0.1:${port}/ingest/metro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bundle_build_done',
          platform: 'ios',
          bundleStats: { modules: [{ name: 'index.js', size: 10, sourcePath: '/proj/index.js' }] },
        }),
      })
      expect(res.status).toBe(200)

      const store = new ArtifactStore(dir)
      expect(store.list().some(a => a.title.startsWith('Bundle size snapshot'))).toBe(true)

      const status = await daemonStatus(dir)
      expect(status.running).toBe(true)
      expect(status.health).toBe('ok')
    } finally {
      close()
    }

    // Close removes the state file so --stop/--status report not-running.
    expect(readDaemonState(dir)).toBeNull()
  })

  it('refuses to start twice while another daemon holds the state file', async () => {
    const first = await startDaemon(dir, { deviceProbe: false })
    try {
      await expect(startDaemon(dir, { deviceProbe: false })).rejects.toThrow(/already running/)
    } finally {
      first.close()
    }
  })

  it('telemetryWatch ingests new exports as they land and stops cleanly', async () => {
    const telemetryDir = join(dir, '.vectalon', 'telemetry')
    mkdirSync(telemetryDir, { recursive: true })

    const { close } = await startDaemon(dir, {
      deviceProbe: false,
      telemetryWatch: true,
      telemetryWatchIntervalMs: 20,
    })
    try {
      // Drop an export after the daemon started — the watch loop should pick
      // it up on the next poll (20 ms) and store it in the knowledge base.
      writeFileSync(join(telemetryDir, 'crash.json'), SENTRY_CRASH)
      await new Promise(resolve => setTimeout(resolve, 150))

      const store = new ArtifactStore(dir)
      expect(store.findByType('telemetry')).toHaveLength(1)
      // The per-file scan state proves the loop polled and recorded the file.
      expect(existsSync(telemetryWatchStatePath(dir))).toBe(true)
    } finally {
      close()
    }

    // Closing the daemon does not delete the telemetry scan state (it is not
    // daemon state), but the daemon state file is gone.
    expect(readDaemonState(dir)).toBeNull()
  })
})
