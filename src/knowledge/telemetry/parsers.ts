import type {
  ParsedAnalyticsEvent,
  ParsedCrash,
  ParsedTrace,
  TelemetryEvent,
  TelemetryFormat,
  TelemetryFrame,
} from './types'

/** Convert an epoch-seconds / microsecond timestamp to milliseconds. */
function toMs(value: unknown, unit: 'seconds' | 'micros' = 'seconds'): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return unit === 'seconds' ? Math.round(value * 1000) : Math.round(value / 1000)
}

function toStringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out[key] = String(val)
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseFrames(stacktrace: unknown): TelemetryFrame[] {
  const frames = (stacktrace as { frames?: unknown[] } | undefined)?.frames
  if (!Array.isArray(frames)) return []
  return frames
    .filter(f => f && typeof f === 'object')
    .map(f => {
      const frame = f as Record<string, unknown>
      return {
        filename: typeof frame.filename === 'string' ? frame.filename : undefined,
        function: typeof frame.function === 'string' ? frame.function : typeof frame.function === 'object' ? String(frame.function) : undefined,
        lineno: typeof frame.lineno === 'number' ? frame.lineno : undefined,
        inApp: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
      }
    })
}

/** Parse a single Sentry event or transaction export object. */
export function parseSentryExport(obj: Record<string, unknown>): ParsedCrash | ParsedTrace | null {
  // Envelope payloads wrap the event/transaction in a `payload` field.
  const payload = (obj.payload && typeof obj.payload === 'object' && !Array.isArray(obj.payload) ? obj.payload : obj) as Record<string, unknown>

  const isTransaction = payload.type === 'transaction' || (payload.spans !== undefined && payload.transaction !== undefined)

  if (isTransaction) {
    const timestamp = payload.timestamp ?? payload.end_timestamp
    const startTimestamp = payload.start_timestamp
    const spans = Array.isArray(payload.spans)
      ? payload.spans
          .filter(s => s && typeof s === 'object')
          .map(s => {
            const span = s as Record<string, unknown>
            const start = toMs(span.start_timestamp)
            const end = toMs(span.timestamp)
            return {
              op: typeof span.op === 'string' ? span.op : undefined,
              description: typeof span.description === 'string' ? span.description : undefined,
              durationMs: start !== undefined && end !== undefined ? Math.max(0, end - start) : typeof span.duration === 'number' ? span.duration : 0,
            }
          })
      : []
    const startMs = toMs(startTimestamp)
    const endMs = toMs(timestamp)
    return {
      kind: 'performance',
      name: typeof payload.transaction === 'string' ? payload.transaction : typeof payload.title === 'string' ? payload.title : 'transaction',
      op: typeof payload.op === 'string' ? payload.op : undefined,
      durationMs: startMs !== undefined && endMs !== undefined ? Math.max(0, endMs - startMs) : spans.reduce((sum, s) => sum + s.durationMs, 0),
      startTimestamp: startMs,
      spans,
      platform: typeof payload.platform === 'string' ? payload.platform : undefined,
      release: typeof payload.release === 'string' ? payload.release : undefined,
      source: 'sentry',
    }
  }

  // Only classify an export as a crash when it carries exception data — a
  // bare Sentry log/message event (event_id + message, no exception, no
  // frames) is not a crash and would otherwise pollute crash counts.
  const hasException = payload.exception !== undefined
  if (!hasException) return null

  const values = (payload.exception as { values?: unknown[] } | undefined)?.values
  const first = Array.isArray(values) && values.length > 0 && values[0] && typeof values[0] === 'object'
    ? (values[0] as Record<string, unknown>)
    : undefined

  const exceptionType = typeof first?.type === 'string' ? first.type : undefined
  const exceptionValue = typeof first?.value === 'string' ? first.value : undefined
  const frames = first ? parseFrames(first.stacktrace) : []

  const message =
    exceptionValue ||
    (typeof payload.message === 'string' ? payload.message : typeof payload.message === 'object' ? String((payload.message as { formatted?: string }).formatted ?? '') : undefined) ||
    undefined

  const user = payload.user && typeof payload.user === 'object' && !Array.isArray(payload.user)
    ? (payload.user as Record<string, unknown>)
    : undefined

  return {
    kind: 'crash',
    id: typeof payload.event_id === 'string' ? payload.event_id : `sentry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'sentry',
    platform: typeof payload.platform === 'string' ? payload.platform : undefined,
    release: typeof payload.release === 'string' ? payload.release : undefined,
    environment: typeof payload.environment === 'string' ? payload.environment : undefined,
    timestamp: toMs(payload.timestamp),
    exceptionType,
    message: message || exceptionType,
    culprit: typeof payload.culprit === 'string' ? payload.culprit : undefined,
    frames,
    fingerprint: Array.isArray(payload.fingerprint) ? payload.fingerprint.filter(f => typeof f === 'string') : undefined,
    tags: toStringMap(payload.tags),
    user: user
      ? {
          id: typeof user.id === 'string' ? user.id : typeof user.user_id === 'string' ? user.user_id : undefined,
          email: typeof user.email === 'string' ? user.email : undefined,
          ipAddress: typeof user.ip_address === 'string' ? user.ip_address : undefined,
        }
      : undefined,
  }
}

const CRASHLYTICS_EVENT_TYPES = new Set(['crash', 'error', 'ndk-crash', 'anr', 'background-anr'])

/** Parse a single Firebase Crashlytics report object (BigQuery-style export). */
export function parseCrashlyticsReport(obj: Record<string, unknown>): ParsedCrash | null {
  const event = (obj.event && typeof obj.event === 'object' && !Array.isArray(obj.event) ? obj.event : obj) as Record<string, unknown>
  const eventType = typeof event.type === 'string' ? event.type : undefined
  if (eventType && !CRASHLYTICS_EVENT_TYPES.has(eventType)) return null

  const exception = (obj.exception && typeof obj.exception === 'object' && !Array.isArray(obj.exception) ? obj.exception : {}) as Record<string, unknown>
  const app = (obj.app_info && typeof obj.app_info === 'object' && !Array.isArray(obj.app_info) ? obj.app_info : {}) as Record<string, unknown>
  const device = (obj.device_info && typeof obj.device_info === 'object' && !Array.isArray(obj.device_info) ? obj.device_info : {}) as Record<string, unknown>
  const user = (obj.user_info && typeof obj.user_info === 'object' && !Array.isArray(obj.user_info) ? obj.user_info : {}) as Record<string, unknown>

  const reason = typeof exception.reason === 'string' ? exception.reason : typeof exception.issueDetails === 'string' ? exception.issueDetails : undefined
  const exceptionType = typeof exception.type === 'string' ? exception.type : eventType

  // Crashlytics exports stack traces as a plain string or an array of frame objects.
  let frames: TelemetryFrame[] = []
  const rawTrace = exception.stackTrace ?? exception.stack_trace
  if (typeof rawTrace === 'string') {
    frames = rawTrace
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => ({ filename: line.replace(/^\s*at\s+/, '').trim() }))
  } else if (Array.isArray(rawTrace)) {
    frames = rawTrace
      .filter(f => f && typeof f === 'object')
      .map(f => {
        const frame = f as Record<string, unknown>
        return {
          filename: typeof frame.fileName === 'string' ? frame.fileName : typeof frame.file === 'string' ? frame.file : undefined,
          function: typeof frame.symbol === 'string' ? frame.symbol : typeof frame.method === 'string' ? frame.method : undefined,
          lineno: typeof frame.lineNumber === 'number' ? frame.lineNumber : undefined,
        }
      })
  }

  const id = typeof event.id === 'string' ? event.id : typeof event.event_id === 'string' ? event.event_id : `crashlytics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    kind: 'crash',
    id,
    source: 'crashlytics',
    platform: typeof device.os === 'string' ? (device.os as string).toLowerCase() : typeof device.platform === 'string' ? device.platform : undefined,
    release: (() => {
      const version = typeof app.app_version === 'string' && app.app_version !== '' ? app.app_version : undefined
      const build = typeof app.build_version === 'string' && app.build_version !== '' ? app.build_version : undefined
      return version ? `${version}${build ? ` (${build})` : ''}` : build || undefined
    })(),
    environment: typeof obj.environment === 'string' ? obj.environment : undefined,
    timestamp: toMs(event.timestamp, 'micros'),
    exceptionType,
    message: reason || exceptionType,
    culprit: undefined,
    frames,
    fingerprint: typeof (obj.metadata as Record<string, unknown> | undefined)?.issue_id === 'string'
      ? [(obj.metadata as Record<string, string>).issue_id]
      : undefined,
    tags: toStringMap(app),
    user: { id: typeof user.user_id === 'string' ? user.user_id : undefined },
  }
}

/** Parse a single performance trace export (Sentry transaction, Firebase trace, or generic). */
export function parsePerformanceTrace(obj: Record<string, unknown>): ParsedTrace | null {
  if (obj.type === 'transaction' || obj.spans !== undefined || obj.transaction !== undefined) {
    const parsed = parseSentryExport(obj)
    if (parsed && parsed.kind === 'performance') return parsed
  }

  const name =
    typeof obj.name === 'string' ? obj.name :
    typeof obj.trace === 'string' ? obj.trace :
    typeof obj.metric_name === 'string' ? obj.metric_name :
    typeof obj.title === 'string' ? obj.title : undefined
  const durationMs =
    typeof obj.durationMs === 'number' ? obj.durationMs :
    typeof obj.duration_ms === 'number' ? obj.duration_ms :
    typeof obj.duration === 'number' ? obj.duration :
    typeof obj.durationMs === 'string' ? Number(obj.durationMs) :
    undefined
  if (!name || durationMs === undefined || !Number.isFinite(durationMs)) return null

  const spans = Array.isArray(obj.spans)
    ? obj.spans.filter(s => s && typeof s === 'object').map(s => {
        const span = s as Record<string, unknown>
        return {
          op: typeof span.op === 'string' ? span.op : undefined,
          description: typeof span.description === 'string' ? span.description : undefined,
          durationMs: typeof span.durationMs === 'number' ? span.durationMs : typeof span.duration === 'number' ? span.duration : 0,
        }
      })
    : undefined

  return {
    kind: 'performance',
    name,
    op: typeof obj.op === 'string' ? obj.op : undefined,
    durationMs,
    startTimestamp: typeof obj.startTimestamp === 'number' ? obj.startTimestamp : toMs(obj.start_timestamp),
    spans,
    platform: typeof obj.platform === 'string' ? obj.platform : undefined,
    release: typeof obj.release === 'string' ? obj.release : undefined,
    source: typeof obj.source === 'string' && (obj.source === 'sentry' || obj.source === 'firebase') ? obj.source : 'generic',
  }
}

/** Parse a single analytics event (Firebase BigQuery export row or generic event). */
export function parseAnalyticsEvent(obj: Record<string, unknown>): ParsedAnalyticsEvent | null {
  const name =
    typeof obj.event_name === 'string' ? obj.event_name :
    typeof obj.event === 'string' ? obj.event :
    typeof obj.name === 'string' ? obj.name : undefined
  if (!name) return null

  const properties: Record<string, string | number | boolean> = {}
  const rawParams = obj.event_params ?? obj.params ?? obj.properties
  if (Array.isArray(rawParams)) {
    for (const entry of rawParams) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const key = typeof e.key === 'string' ? e.key : undefined
      if (!key) continue
      const value = (e.value && typeof e.value === 'object' && !Array.isArray(e.value) ? e.value : {}) as Record<string, unknown>
      const val = value.string_value ?? value.int_value ?? value.double_value ?? value.float_value ?? value.bool_value
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') properties[key] = val
    }
  } else if (rawParams && typeof rawParams === 'object') {
    for (const [key, val] of Object.entries(rawParams as Record<string, unknown>)) {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') properties[key] = val
    }
  }

  const isFirebase = obj.event_name !== undefined || obj.event_date !== undefined
  const timestamp = obj.event_timestamp !== undefined
    ? toMs(obj.event_timestamp, 'micros')
    : typeof obj.timestamp === 'number' ? (obj.timestamp > 1e12 ? toMs(obj.timestamp, 'micros') : toMs(obj.timestamp)) : undefined

  return {
    kind: 'analytics',
    name,
    timestamp,
    properties: Object.keys(properties).length > 0 ? properties : undefined,
    userId: typeof obj.user_pseudo_id === 'string' ? obj.user_pseudo_id : typeof obj.userId === 'string' ? obj.userId : undefined,
    platform: typeof obj.platform === 'string' ? obj.platform.toLowerCase() : undefined,
    source: isFirebase ? 'firebase' : 'generic',
  }
}

/** Detect the telemetry format of a single parsed JSON object. */
export function detectTelemetryFormat(obj: Record<string, unknown>): TelemetryFormat {
  const payload = (obj.payload && typeof obj.payload === 'object' && !Array.isArray(obj.payload) ? obj.payload : obj) as Record<string, unknown>

  if (obj.app_info !== undefined && obj.exception !== undefined) return 'crashlytics'
  if (payload.exception !== undefined) return 'sentry'
  if (payload.type === 'transaction' || payload.transaction !== undefined || payload.spans !== undefined) return 'performance'
  if (obj.event_name !== undefined || obj.event_date !== undefined) return 'analytics'
  if (payload.event_id !== undefined || payload.culprit !== undefined) return 'sentry'
  if (obj.event !== undefined && typeof obj.event === 'object') {
    const type = (obj.event as Record<string, unknown>).type
    if (typeof type === 'string' && CRASHLYTICS_EVENT_TYPES.has(type)) return 'crashlytics'
  }
  if (obj.trace !== undefined || obj.metric_name !== undefined || obj.durationMs !== undefined || obj.duration_ms !== undefined) return 'performance'
  if (obj.event !== undefined || obj.properties !== undefined || obj.params !== undefined) return 'analytics'
  return 'unknown'
}

/**
 * Parse telemetry content (single JSON object or JSONL) into typed events.
 * Format auto-detects unless overridden.
 */
export function parseTelemetryContent(content: string, forcedFormat?: TelemetryFormat): TelemetryEvent[] {
  const events: TelemetryEvent[] = []
  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return events

  const isJsonLines = lines.length > 1 || (lines.length === 1 && (lines[0].startsWith('{') && lines[0].endsWith('}') === false))

  const pushObject = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
    const record = obj as Record<string, unknown>
    const format = forcedFormat || detectTelemetryFormat(record)
    switch (format) {
      case 'sentry': {
        const parsed = parseSentryExport(record)
        if (parsed) events.push(parsed)
        break
      }
      case 'crashlytics': {
        const parsed = parseCrashlyticsReport(record)
        if (parsed) events.push(parsed)
        break
      }
      case 'performance': {
        const parsed = parsePerformanceTrace(record)
        if (parsed) events.push(parsed)
        break
      }
      case 'analytics': {
        const parsed = parseAnalyticsEvent(record)
        if (parsed) events.push(parsed)
        break
      }
      default:
        break
    }
  }

  if (isJsonLines) {
    for (const line of lines) {
      try {
        pushObject(JSON.parse(line))
      } catch {
        // Skip malformed lines within a JSONL stream.
      }
    }
    return events
  }

  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      for (const item of parsed) pushObject(item)
    } else {
      pushObject(parsed)
    }
  } catch {
    // Not JSON — nothing to ingest.
  }
  return events
}
