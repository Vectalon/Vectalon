/**
 * Diagnostics & error telemetry — shared types.
 * Business Source License 1.1 (BSL-1.1)
 *
 * P0 telemetry: structured error reporting (opt-out), --diagnostics bundles,
 * liveness heartbeats, deep /health checks, and support-bundle uploads.
 */

/** One structured error event sent to the backend (errors only, opt-out). */
export interface ErrorReport {
  /** Schema version for the backend ingest. */
  schemaVersion: number
  /** Epoch ms the error occurred. */
  timestamp: number
  /** The CLI command context, e.g. "serve --protocol http". */
  command: string
  /** Error message (stack is stripped to the first line for privacy). */
  message: string
  /** Full stack trace — sent only when stack traces are enabled. */
  stack?: string
  /** Optional contextual breadcrumb, e.g. "model provider: openai". */
  context?: string
  /** package version, e.g. "0.1.15". */
  version: string
  /** Node.js version, e.g. "v22.14.0". */
  nodeVersion: string
  /** OS identifier, e.g. "darwin 25.6.0 arm64". */
  os: string
  /** True when this event came from the user's machine (never a test). */
  production?: boolean
}

/** Liveness heartbeat payload from serve / daemon (not usage tracking). */
export interface HeartbeatPayload {
  schemaVersion: number
  /** 'serve' | 'daemon' */
  kind: 'serve' | 'daemon'
  version: string
  /** Epoch ms the process started. */
  startedAt: number
  /** Epoch ms of this ping. */
  timestamp: number
  /** Active model provider label, e.g. "openai (gpt-4o)". */
  activeModelProvider: string
  /** OS identifier. */
  os: string
  /** 'expo' | 'rn-cli' | 'unknown' — the project flavor. */
  projectType: string
  pid: number
  production?: boolean
}

export type CheckStatus = 'ok' | 'warn' | 'fail'

/** One deep-health check result. */
export interface HealthCheck {
  name: string
  status: CheckStatus
  /** Short human-readable detail for the check. */
  detail: string
}

export type HealthStatus = 'healthy' | 'degraded' | 'critical'

/** Structured /health response: healthy | degraded | critical + checks[]. */
export interface HealthReport {
  status: HealthStatus
  checks: HealthCheck[]
  /** Epoch ms the report was generated. */
  timestamp: number
  version: string
}

/** Full --diagnostics bundle written to .vectalon/diagnostics-bundle.json. */
export interface DiagnosticsBundle {
  schemaVersion: number
  command: string
  /** Epoch ms the bundle was written. */
  timestamp: number
  environment: {
    nodeVersion: string
    os: string
    arch: string
    cwd: string
    pid: number
    uptimeMs: number
  }
  project: {
    /** react-native / expo versions from package.json when present. */
    rnVersion?: string
    expoVersion?: string
    /** Model provider from .vectalon/rn-vectalon.json when present. */
    modelProvider?: string
    projectType: 'expo' | 'rn-cli' | 'unknown'
    hasVectalonDir: boolean
  }
  /** Last N log lines emitted by the logger (default 5000). */
  logLines: string[]
  /** Full stack trace of the current error, when captured under --diagnostics. */
  errorStack?: string
  /** Listing of the .vectalon/ workspace (paths + sizes), sanitized. */
  vectalonState: Array<{ path: string; size: number }>
}

/** Sanitized support bundle uploaded for paying customers. */
export interface SupportBundle {
  schemaVersion: number
  /** Short support token the user can paste into a ticket. */
  token: string
  timestamp: number
  version: string
  nodeVersion: string
  os: string
  /** Sanitized package.json (secrets stripped). */
  packageJson: Record<string, unknown> | null
  /** Last log lines (ring buffer). */
  logs: string[]
  /** Pending error events from the local queue. */
  errorQueue: ErrorReport[]
  /** Listing of .vectalon/ (paths + sizes). */
  vectalonState: Array<{ path: string; size: number }>
  /** The recipient support address. */
  recipient: string
}
