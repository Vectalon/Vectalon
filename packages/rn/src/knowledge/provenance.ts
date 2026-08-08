/**
 * Knowledge provenance & confidence scoring — III-3.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Every artifact and learned pattern carries provenance: where it came from,
 * how confident we are in it, and when it goes stale. Retrieval can then rank
 * by confidence so agents trust recent, high-confidence context over stale or
 * speculative guesses.
 *
 * Confidence is deterministic — computed from the artifact's source, status,
 * and recency — no model calls. Staleness is a simple recency decay: an
 * artifact is "fresh" until its staleness date (last updated + TTL), then its
 * confidence decays toward a floor over successive half-lives.
 *
 * The staleness date itself is informational metadata (surfaced to clients via
 * the MCP tool); the half-life decay below is what actually drives ranking.
 */

import type { Artifact, ArtifactSource, ArtifactStatus } from './artifactTypes'

/** Base confidence per provenance source (how trustworthy the origin is). */
export const SOURCE_CONFIDENCE: Record<ArtifactSource, number> = {
  generated: 1.0, // produced by the harness from verified inputs
  user: 0.9, // written by a human
  import: 0.75, // imported from a file/tool, unverified
  daemon: 0.6, // machine-observed (telemetry, probes)
}

/** Multiplier for the artifact lifecycle status. */
export const STATUS_CONFIDENCE: Record<ArtifactStatus, number> = {
  active: 1.0,
  draft: 0.8,
  deprecated: 0.4,
}

/** Provenance attached to an artifact or pattern. */
export interface Provenance {
  /** Deterministic 0..1 confidence score. */
  confidence: number
  /** Where the knowledge came from. */
  source: string
  /** Epoch ms after which the knowledge is considered stale. */
  stalenessDate: number
  /** Epoch ms the knowledge was last refreshed. */
  refreshedAt: number
}

export interface ProvenanceOptions {
  /** Freshness TTL in days (default 90). */
  ttlDays?: number
  /** Reference "now" in epoch ms — injectable for deterministic tests. */
  now?: number
  /** Confidence floor after unlimited decay (default 0.25). */
  floor?: number
}

const DEFAULT_TTL_DAYS = 90
const DEFAULT_FLOOR = 0.25
const DAY_MS = 24 * 3600_000

/** Staleness date: last updated + TTL. */
export function stalenessDate(artifact: Pick<Artifact, 'updatedAt'>, ttlDays = DEFAULT_TTL_DAYS): number {
  return artifact.updatedAt + ttlDays * DAY_MS
}

/**
 * Recency factor 0..1. Fresh artifacts score 1; after the staleness date the
 * factor halves every TTL period until it hits the floor.
 *
 * Exact formula (deterministic given `now`):
 *   recencyFactor = 1                                when now <= updatedAt + TTL
 *                 = max(floor, 0.5^halfLives)        otherwise
 *   halfLives     = (now - stalenessDate) / (TTL × DAY_MS)
 */
export function recencyFactor(artifact: Pick<Artifact, 'updatedAt'>, options: ProvenanceOptions = {}): number {
  const { ttlDays = DEFAULT_TTL_DAYS, now = Date.now(), floor = DEFAULT_FLOOR } = options
  const staleAt = stalenessDate(artifact, ttlDays)
  if (now <= staleAt) return 1
  const halfLives = (now - staleAt) / (ttlDays * DAY_MS)
  return Math.max(floor, Math.pow(0.5, halfLives))
}

/** Clamp a number into 0..1. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Round to 3 decimals for stable, comparable scores. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Deterministic 0..1 confidence for an artifact: source trust × status
 * multiplier × recency decay.
 */
export function computeConfidence(artifact: Artifact, options: ProvenanceOptions = {}): number {
  const source = SOURCE_CONFIDENCE[artifact.source] ?? 0.5
  const status = STATUS_CONFIDENCE[artifact.status] ?? 0.8
  return round3(clamp01(source * status * recencyFactor(artifact, options)))
}

/** Build the full provenance record for an artifact. */
export function artifactProvenance(artifact: Artifact, options: ProvenanceOptions = {}): Provenance {
  return {
    confidence: computeConfidence(artifact, options),
    source: artifact.source,
    stalenessDate: stalenessDate(artifact, options.ttlDays ?? DEFAULT_TTL_DAYS),
    refreshedAt: artifact.updatedAt,
  }
}

/**
 * Map a 0..1 confidence into a retrieval multiplier so ranking prefers
 * confident context without drowning out relevance: 1.0 confidence keeps the
 * full relevance score, a 0.25-confidence stale doc keeps 40% of it.
 */
export function confidenceFactor(confidence: number, options: { min?: number } = {}): number {
  const min = options.min ?? 0.4
  return clamp01(min + (1 - min) * clamp01(confidence))
}

export interface RankableResult {
  artifact: Artifact
  /** Original relevance score (lexical + weighted semantic). */
  score: number
}

export interface RankedResult extends RankableResult {
  confidence: number
  provenance: Provenance
  /** relevance × confidenceFactor — what retrieval sorts by. */
  rankedScore: number
}

/**
 * Attach provenance and re-rank results by confidence so recent,
 * high-confidence context wins. Deterministic — same inputs, same order.
 */
export function rankByConfidence<T extends RankableResult>(
  results: T[],
  options: ProvenanceOptions = {}
): Array<T & RankedResult> {
  const ranked = results.map(r => {
    const provenance = artifactProvenance(r.artifact, options)
    return {
      ...r,
      confidence: provenance.confidence,
      provenance,
      rankedScore: round3(r.score * confidenceFactor(provenance.confidence)),
    }
  })
  // Stable: relevance first, then confidence, then recency.
  return ranked.sort(
    (a, b) =>
      b.rankedScore - a.rankedScore ||
      b.confidence - a.confidence ||
      b.artifact.updatedAt - a.artifact.updatedAt
  )
}

// ---------------------------------------------------------------------------
// Learned patterns
// ---------------------------------------------------------------------------

export type PatternSource = 'learner' | 'manual' | 'web'

export interface PatternProvenanceInput {
  source?: PatternSource
  /** Epoch ms the pattern was last observed. */
  lastSeen: number
  confidence: number
}

/**
 * Provenance for a learned pattern: the learner's confidence decays with
 * staleness (a convention not seen in a while is less trustworthy).
 */
export function patternProvenance(
  pattern: PatternProvenanceInput,
  options: ProvenanceOptions = {}
): Provenance {
  const { ttlDays = DEFAULT_TTL_DAYS, now = Date.now(), floor = DEFAULT_FLOOR } = options
  const staleAt = pattern.lastSeen + ttlDays * DAY_MS
  const factor = now <= staleAt ? 1 : Math.max(floor, Math.pow(0.5, (now - staleAt) / (ttlDays * DAY_MS)))
  const sourceTrust = pattern.source === 'manual' ? 1.0 : pattern.source === 'web' ? 0.85 : 0.7
  return {
    confidence: round3(clamp01(pattern.confidence * sourceTrust * factor)),
    source: pattern.source ?? 'learner',
    stalenessDate: staleAt,
    refreshedAt: pattern.lastSeen,
  }
}
