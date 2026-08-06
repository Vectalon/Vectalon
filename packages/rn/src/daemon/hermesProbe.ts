import type { ArtifactStore } from '../knowledge/ArtifactStore'
import { reportError } from '../utils/safe'
import { dynamicImport } from '../utils/dynamicImport'
import type { HermesTarget, JsThreadHealth, ProbeResult } from './types'

/**
 * Hermes JS-thread health probe.
 *
 * When a simulator/emulator with a Hermes runtime is connected to Metro, the
 * daemon measures JS-thread responsiveness through the inspector proxy: it
 * finds a Hermes debug page (`/inspector/device`), connects over WebSocket,
 * and times a trivial `Runtime.evaluate` round-trip. High latency (or a
 * non-responsive thread) is recorded as a JS-thread blocking event in the
 * knowledge base — so a frozen UI thread surfaces as an artifact, not just a
 * spinning beachball.
 *
 * Everything is injectable (`fetchFn` / `wsFactory`) so tests are fully
 * deterministic and no real device is needed.
 */

/** Minimal WebSocket surface the probe uses (ws-compatible). */
export interface WsInstance {
  on(event: string, callback: (...args: unknown[]) => void): void
  send(data: string): void
  close(): void
}

export type WsCtor = new (url: string) => WsInstance

export interface MeasureOptions {
  metroPort: number
  /** Injectable WebSocket constructor factory (default: the `ws` package). */
  wsFactory: () => Promise<WsCtor>
  /** Max time to wait for the round-trip before declaring the target unreachable. */
  timeoutMs?: number
}

type ProbeLog = { info: (m: string) => void; warn: (m: string) => void; debug: (m: string) => void }

export interface ProbeCycleOptions {
  root: string
  metroPort: number
  store: ArtifactStore
  /** WebSocket constructor factory (default: the `ws` package). */
  wsFactory?: () => Promise<WsCtor>
  fetchFn?: typeof fetch
  /** Health of the previous probe — artifacts are only recorded on change. */
  previousHealth?: ProbeResult['health'] | null
  log?: ProbeLog
}

const HEALTHY_MS = 100
const BLOCKED_MS = 500

/** Classify a measured round-trip latency into JS-thread health. */
export function classifyJsThread(latencyMs: number): JsThreadHealth {
  if (latencyMs < HEALTHY_MS) return 'healthy'
  if (latencyMs < BLOCKED_MS) return 'slow'
  return 'blocked'
}

/** Discover Hermes debug pages through Metro's inspector proxy. */
export async function discoverHermesTargets(
  metroPort: number,
  fetchFn: typeof fetch = fetch
): Promise<HermesTarget[]> {
  try {
    const res = await fetchFn(`http://localhost:${metroPort}/inspector/device`)
    if (!res.ok) return []
    const devices = (await res.json()) as Array<{
      id?: string
      description?: string
      pageList?: Array<{ id?: string; title?: string }>
    }>
    const targets: HermesTarget[] = []
    for (const device of devices) {
      const deviceId = device.id || ''
      for (const page of device.pageList || []) {
        const title = page.title || ''
        if (!page.id) continue
        // React Native debugger pages are titled with 'React Native' (and
        // 'Hermes' on some Metro versions). Match on the page title only — the
        // device description is the model name and would match every page.
        if (/hermes/i.test(title) || /react native/i.test(title)) {
          targets.push({ deviceId, pageId: page.id, title })
        }
      }
    }
    return targets
  } catch (err) {
    reportError(err, 'daemon: hermes probe — metro inspector unreachable')
    return []
  }
}

/**
 * Measure JS-thread round-trip latency (ms) via a CDP `Runtime.evaluate` over
 * Metro's inspector WebSocket proxy. Returns null when the target cannot be
 * reached or times out — that is "unreachable", not "blocked".
 */
export async function measureJsThreadLatency(
  target: HermesTarget,
  options: MeasureOptions
): Promise<number | null> {
  let Ctor: WsCtor
  try {
    Ctor = await options.wsFactory()
  } catch (err) {
    reportError(err, 'daemon: hermes probe — websocket client unavailable')
    return null
  }

  const url =
    `ws://localhost:${options.metroPort}/inspector/debug` +
    `?device=${encodeURIComponent(target.deviceId)}&page=${encodeURIComponent(target.pageId)}`

  return new Promise<number | null>(resolve => {
    let ws: WsInstance | null = null
    let settled = false
    let t0 = 0
    let finish: (latency: number | null) => void = () => undefined
    const timeoutMs = options.timeoutMs ?? 5000
    const timer = setTimeout(() => finish(null), timeoutMs)

    finish = (latency: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws?.close()
      } catch (err) {
        reportError(err, 'daemon: hermes probe — closing websocket')
      }
      resolve(latency)
    }

    try {
      ws = new Ctor(url)
    } catch (err) {
      reportError(err, 'daemon: hermes probe — opening websocket')
      finish(null)
      return
    }

    ws.on('open', () => {
      try {
        ws?.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
      } catch (err) {
        reportError(err, 'daemon: hermes probe — sending Runtime.enable')
      }
    })

    ws.on('message', (data: unknown) => {
      let msg: { id?: number } = {}
      try {
        msg = JSON.parse(typeof data === 'string' ? data : String(data))
      } catch (err) {
        reportError(err, 'daemon: hermes probe — parsing inspector message')
        return
      }
      if (msg.id === 1) {
        t0 = Date.now()
        try {
          ws?.send(
            JSON.stringify({
              id: 2,
              method: 'Runtime.evaluate',
              params: { expression: '1+1', returnByValue: true },
            })
          )
        } catch (err) {
          reportError(err, 'daemon: hermes probe — sending Runtime.evaluate')
        }
      } else if (msg.id === 2) {
        finish(Date.now() - t0)
      }
    })

    ws.on('error', () => finish(null))
    ws.on('close', () => finish(null))
  })
}

const NOOP_LOG: ProbeLog = { info: () => undefined, warn: () => undefined, debug: () => undefined }

/**
 * One probe pass: discover a Hermes target, measure the JS thread, and record
 * a blocking/slow event artifact when the health classification changes.
 */
export async function runProbeCycle(options: ProbeCycleOptions): Promise<ProbeResult> {
  const log = options.log || NOOP_LOG

  const targets = await discoverHermesTargets(options.metroPort, options.fetchFn || fetch)
  if (targets.length === 0) {
    log.debug(`daemon: hermes probe — no Hermes target on Metro :${options.metroPort}`)
    return { detected: false, health: 'idle', latencyMs: null }
  }

  const target = targets[0]
  const latencyMs = await measureJsThreadLatency(target, {
    metroPort: options.metroPort,
    wsFactory: options.wsFactory || defaultWsFactory,
  })

  if (latencyMs === null) {
    log.debug(`daemon: hermes probe — target unreachable (${target.title})`)
    return { detected: true, health: 'unreachable', latencyMs: null }
  }

  const health = classifyJsThread(latencyMs)
  log.info(`daemon: JS thread ${health} (${latencyMs} ms round-trip) — ${target.title}`)

  // Only record an artifact when the classification changed (or first became
  // slow/blocked), so a 30 s probe loop never spams the knowledge base.
  const previous = options.previousHealth || null
  const changed = health !== previous
  let recordedArtifact: string | undefined
  if (health !== 'healthy' && changed) {
    recordedArtifact = recordHealthEvent(options.store, health, latencyMs, target)
  }

  return { detected: true, health, latencyMs, recordedArtifact }
}

function recordHealthEvent(
  store: ArtifactStore,
  health: Exclude<JsThreadHealth, 'healthy'>,
  latencyMs: number,
  target: HermesTarget
): string {
  const title = `JS thread ${health} (${latencyMs} ms)`
  const content = [
    `# JS thread ${health}`,
    '',
    `The Hermes JS thread on "${target.title}" took **${latencyMs} ms** to respond to a debugger round-trip.`,
    health === 'blocked'
      ? 'A blocked JS thread means the UI cannot process events — look for synchronous work on the JS thread (heavy render, blocking I/O, or an infinite loop).'
      : 'A slow JS thread degrades animation and input responsiveness — profile with the Hermes profiler or React DevTools.',
    '',
    `Detected by the vectalon daemon at ${new Date().toISOString()}.`,
  ].join('\n')

  store.add({
    type: 'operations',
    title,
    content,
    source: 'daemon',
    status: 'active',
    meta: {
      kind: 'js-thread-health',
      health,
      latencyMs: String(latencyMs),
      target: target.title,
    },
  })
  return title
}

/** Default WebSocket constructor: the `ws` package (pure JS, no native build). */
export async function defaultWsFactory(): Promise<WsCtor> {
  const mod = (await dynamicImport<Record<string, unknown>>('ws')) as Record<string, unknown>
  const ctor = ('default' in mod ? mod.default : undefined) as unknown
  return (ctor || mod) as unknown as WsCtor
}
