/**
 * Live Metro/Hermes companion daemon — shared types.
 *
 * The daemon is a small background process (`vectalon daemon`) that turns the
 * on-demand bundle analysis + device tooling into a continuous loop: Metro
 * build events stream in from a generated reporter, bundle-size changes are
 * compared against the previous build, build errors and JS-thread health land
 * in the knowledge base automatically, and proactive tips are surfaced the
 * moment a build changes the bundle composition ("your last Metro build added
 * lodash — that's +80 KB").
 */

import type { BundleAnalysis, MetroBundleStats } from '../utils/bundleAnalyzer'

/** Metro reporter events the daemon understands. */
export type MetroEvent =
  | {
      type: 'bundle_build_done'
      platform?: string
      bundleStats: MetroBundleStats
    }
  | {
      type: 'bundle_build_failed'
      platform?: string
      error: string
    }

/** Outcome of ingesting one Metro event. */
export interface IngestResult {
  kind: 'bundle_done' | 'bundle_failed' | 'ignored'
  /** Human-readable insight lines surfaced to the user (proactive tips). */
  insights: string[]
  /** Titles of artifacts persisted to the knowledge base. */
  artifacts: string[]
  /** Bundle delta vs the previous build in this daemon session, when computed. */
  delta?: {
    pct: number
    previous: BundleAnalysis
    current: BundleAnalysis
  }
}

/** Composition delta between two bundle analyses (for proactive tips). */
export interface BundleCompositionDelta {
  added: Array<{ name: string; size: number; moduleCount: number }>
  removed: Array<{ name: string; size: number; moduleCount: number }>
  grew: Array<{ name: string; size: number; moduleCount: number }>
  shrank: Array<{ name: string; size: number; moduleCount: number }>
}

/** A Hermes debug target discovered through Metro's inspector proxy. */
export interface HermesTarget {
  deviceId: string
  pageId: string
  title: string
}

/** JS-thread health classification from a measured CDP round-trip. */
export type JsThreadHealth = 'healthy' | 'slow' | 'blocked'

/** Result of one Hermes probe pass. */
export interface ProbeResult {
  detected: boolean
  health: JsThreadHealth | 'idle' | 'unreachable'
  latencyMs: number | null
  error?: string
  /** Title of the artifact recorded when the health classification changed. */
  recordedArtifact?: string
}

/** The runtime state `vectalon daemon --status` reports. */
export interface DaemonStatus {
  running: boolean
  port?: number
  pid?: number
  startedAt?: number
  health?: string
  probe?: ProbeResult
}
