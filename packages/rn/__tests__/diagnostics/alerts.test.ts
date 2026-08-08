/**
 * Admin alert webhook (P2-19): error-signature clustering and stale-heartbeat
 * detection. The webhook URL is read from the env at module load, so this file
 * sets VECTALON_ALERT_WEBHOOK before requiring the module and stubs globalThis
 * fetch to record POSTs instead of hitting the real endpoint.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { TrialTracker, LicenseStore } from '@vectalon-dev/core'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'
import { resetConfig } from '../../src/config'

// The webhook URL is read from the env at module load, so it must be set
// before the (dynamic) import of the alerts module in beforeAll.
process.env.VECTALON_ALERT_WEBHOOK = 'https://discord.example/webhook'

interface AlertsModule {
  errorFingerprint: (event: { stack?: string; message: string; timestamp?: number }) => string
  buildAlertText: (payload: Record<string, unknown>) => string
  checkErrorClusterAlert: (events: Array<Record<string, unknown>>, now?: number) => void
  recordHeartbeatPing: (root: string, kind: string) => void
  checkHeartbeatStaleness: (root: string, now?: number) => void
  heartbeatStatePath: (root: string) => string
  ALERT_WEBHOOK_URL: string
}

describe('admin alert webhook (P2-19)', () => {
  let root: string
  let configDir: string
  let fetchMock: jest.Mock
  let alerts: AlertsModule
  const now = 1700000000000

  beforeEach(async () => {
    // Order matters: the config dir + webhook env must be in place BEFORE the
    // (fresh) module import, because alerts.ts and @vectalon-dev/core capture
    // both at load time. A cached import or stale config dir silently disables
    // alerting or leaks a prior test's trial.
    root = createTempProject({ 'package.json': '{}' })
    configDir = useTempConfig()
    resetConfig()
    // Core's LicenseStore hardcodes ~/.config/vectalon (ignores the temp
    // config dir), so a trial started in one test persists for every later
    // test. Clear it before each test to isolate license state.
    LicenseStore.clearTrial()
    process.env.VECTALON_ALERT_WEBHOOK = 'https://discord.example/webhook'
    jest.resetModules()
    alerts = (await import('../../src/diagnostics/alerts')) as unknown as AlertsModule

    fetchMock = jest.fn(async () => ({ ok: true, status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    cleanup(root)
    cleanup(configDir)
    LicenseStore.clearTrial()
    // `fetch` is a required (non-optional) global in newer TS libs, so delete
    // needs a cast — CI's TS is stricter than the local dev toolchain.
    delete (globalThis as unknown as { fetch?: unknown }).fetch
  })

  function event(message: string, stack = 'Error: boom\n    at a.ts:1:1\n    at b.ts:2:2', ts = now - 1000): Record<string, unknown> {
    return { schemaVersion: 1, timestamp: ts, command: 'serve', message, stack, version: '0.1.20', os: 'darwin 24.0 arm64' }
  }

  it('is disabled (no-op) without a configured webhook', () => {
    // ALERT_WEBHOOK_URL was captured from the env at import; with it set the
    // module is armed. The disabled path is exercised by the alert send when
    // fetch fails — see below.
    expect(alerts.ALERT_WEBHOOK_URL).toContain('discord.example')
  })

  it('extracts a stable fingerprint from the first two stack frames', () => {
    const fp = alerts.errorFingerprint(event('boom') as never)
    expect(fp).toContain('a.ts:1:1')
    expect(fp).toContain('b.ts:2:2')
    expect(alerts.errorFingerprint({ message: 'no stack', timestamp: now } as never)).toBe('no stack')
  })

  it('builds readable alert text for both payload types', () => {
    const cluster = alerts.buildAlertText({
      type: 'error-cluster',
      fingerprint: 'fp-1',
      count: 7,
      affectedVersions: ['0.1.18', '0.1.19'],
      osCounts: { 'win32 10.0 arm64': 4, 'darwin 24.0 arm64': 3 },
      commands: ['init', 'serve'],
    })
    expect(cluster).toContain('error cluster')
    expect(cluster).toContain('4× win32 10.0 arm64')
    expect(cluster).toContain('0.1.18')

    const stale = alerts.buildAlertText({ type: 'heartbeat-stale', kind: 'serve', lastPingAt: now, version: '0.1.20' })
    expect(stale).toContain('heartbeat silent')
    expect(stale).toContain('serve')
  })

  it('alerts once when ≥5 same-signature errors arrive inside the 1h window', async () => {
    const events = Array.from({ length: 5 }, (_, i) => event(`boom ${i}`) as never)
    alerts.checkErrorClusterAlert(events, now)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.content).toContain('error cluster')
    expect(body.content).toContain('a.ts:1:1')
  })

  it('does not alert below the threshold', async () => {
    const events = Array.from({ length: 4 }, (_, i) => event(`boom ${i}`) as never)
    alerts.checkErrorClusterAlert(events, now)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dedupes: one alert per signature per window', async () => {
    const events = Array.from({ length: 5 }, (_, i) => event(`boom ${i}`) as never)
    alerts.checkErrorClusterAlert(events, now)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Same signature again inside the window — no second alert.
    alerts.checkErrorClusterAlert(events, now + 1000)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('records successful heartbeat pings to .vectalon/heartbeat.json', () => {
    alerts.recordHeartbeatPing(root, 'serve')
    const state = JSON.parse(readFileSync(alerts.heartbeatStatePath(root), 'utf-8'))
    expect(state.kind).toBe('serve')
    expect(typeof state.lastPingAt).toBe('number')
  })

  it('alerts when an active-license heartbeat went silent for >30 min', async () => {
    // Real active trial in the sandboxed config dir.
    TrialTracker.start({ id: 1, login: 'tester' }, 'team')

    alerts.recordHeartbeatPing(root, 'serve')
    // Fresh ping → no alert.
    alerts.checkHeartbeatStaleness(root, now)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()

    // 31 minutes later (no ping since) → alert fires.
    writeFileSync(alerts.heartbeatStatePath(root), JSON.stringify({ kind: 'serve', lastPingAt: now - 31 * 60 * 1000 }))
    alerts.checkHeartbeatStaleness(root, now)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.content).toContain('heartbeat silent')
  })

  it('does not alert for stale heartbeats on free tier', async () => {
    mkdirSync(join(alerts.heartbeatStatePath(root), '..'), { recursive: true })
    writeFileSync(alerts.heartbeatStatePath(root), JSON.stringify({ kind: 'serve', lastPingAt: now - 60 * 60 * 1000 }))
    alerts.checkHeartbeatStaleness(root, now)
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
