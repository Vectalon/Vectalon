import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { startDaemon, daemonStatus, readDaemonState, isDaemonRunning } from '../../src/daemon/daemonRuntime'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../helpers/tmp'

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
})
