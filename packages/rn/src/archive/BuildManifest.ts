/**
 * BuildManifest — typed schema validation + construction (Phase 1).
 *
 * The design doc calls for a Zod schema; this package intentionally has no
 * external validation dependency, so the same contract is enforced with a
 * hand-rolled validator (validateBuildManifest) and a strict builder
 * (createBuildManifest) that throws on invalid input. Both surfaces are
 * covered by hermetic tests.
 */

import { randomUUID } from 'crypto'
import type {
  ArtifactType,
  BuildManifest,
  BuildMetadata,
  DistributionRecord,
  PlatformName,
} from './types'

export const VALID_PLATFORMS: readonly PlatformName[] = ['ios', 'android']
export const VALID_ARTIFACT_TYPES: readonly ArtifactType[] = ['ipa', 'apk', 'aab']

export interface BuildManifestInput {
  projectId: string
  version: string
  buildNumber: number
  flavor: string
  environment: string
  platform: PlatformName
  artifactType: ArtifactType
  artifactPath: string
  artifactSize: number
  checksum: string
  gitCommit: string
  gitBranch: string
  gitTag?: string
  builtBy: string
  buildDurationMs?: number
  metadata: BuildMetadata
  signatures?: BuildManifest['signatures']
  distribution?: DistributionRecord
  buildId?: string
  buildTimestamp?: string
}

/** Validate an arbitrary object as a BuildManifest. Returns error strings or null. */
export function validateBuildManifest(value: unknown): string[] {
  const errors: string[] = []
  if (!value || typeof value !== 'object') {
    return ['BuildManifest must be an object']
  }
  const m = value as Record<string, unknown>
  const requireString = (key: string, allowEmpty = true): void => {
    const v = m[key]
    if (typeof v !== 'string' || (!allowEmpty && v.length === 0)) {
      errors.push(`${key} must be a string${allowEmpty ? '' : ' (non-empty)'}`)
    }
  }
  const requireNumber = (key: string): void => {
    if (typeof m[key] !== 'number' || !Number.isFinite(m[key])) errors.push(`${key} must be a finite number`)
  }

  requireString('buildId', false)
  requireString('projectId', false)
  requireString('version', false)
  requireString('flavor', false)
  requireString('environment', false)
  requireString('artifactPath', false)
  requireString('checksum', false)
  requireString('gitCommit')
  requireString('gitBranch')
  requireString('buildTimestamp', false)
  requireString('builtBy')
  requireNumber('artifactSize')
  if (typeof m.buildNumber !== 'number' || !Number.isInteger(m.buildNumber) || m.buildNumber < 1) {
    errors.push('buildNumber must be a positive integer')
  }

  if (typeof m.platform !== 'string' || !VALID_PLATFORMS.includes(m.platform as PlatformName)) {
    errors.push(`platform must be one of: ${VALID_PLATFORMS.join(', ')}`)
  }
  if (typeof m.artifactType !== 'string' || !VALID_ARTIFACT_TYPES.includes(m.artifactType as ArtifactType)) {
    errors.push(`artifactType must be one of: ${VALID_ARTIFACT_TYPES.join(', ')}`)
  }
  if (m.gitTag !== undefined && typeof m.gitTag !== 'string') errors.push('gitTag must be a string when present')
  if (m.buildDurationMs !== undefined && (typeof m.buildDurationMs !== 'number' || !Number.isFinite(m.buildDurationMs))) {
    errors.push('buildDurationMs must be a finite number when present')
  }
  if (!m.metadata || typeof m.metadata !== 'object') {
    errors.push('metadata must be an object')
  }
  return errors
}

/** Validate a BuildManifest; throws with a joined message on failure. */
export function assertValidBuildManifest(value: unknown): asserts value is BuildManifest {
  const errors = validateBuildManifest(value)
  if (errors.length > 0) {
    throw new Error(`Invalid BuildManifest: ${errors.join('; ')}`)
  }
}

/** Build a manifest from input, generating buildId/buildTimestamp when absent. */
export function createBuildManifest(input: BuildManifestInput): BuildManifest {
  const manifest: BuildManifest = {
    buildId: input.buildId || randomUUID(),
    projectId: input.projectId,
    version: input.version,
    buildNumber: input.buildNumber,
    flavor: input.flavor,
    environment: input.environment,
    platform: input.platform,
    artifactType: input.artifactType,
    artifactPath: input.artifactPath,
    artifactSize: input.artifactSize,
    checksum: input.checksum,
    gitCommit: input.gitCommit,
    gitBranch: input.gitBranch,
    ...(input.gitTag ? { gitTag: input.gitTag } : {}),
    buildTimestamp: input.buildTimestamp || new Date().toISOString(),
    builtBy: input.builtBy,
    ...(input.buildDurationMs !== undefined ? { buildDurationMs: input.buildDurationMs } : {}),
    metadata: input.metadata,
    ...(input.signatures ? { signatures: input.signatures } : {}),
    ...(input.distribution ? { distribution: input.distribution } : {}),
  }
  const errors = validateBuildManifest(manifest)
  if (errors.length > 0) {
    throw new Error(`Invalid BuildManifest: ${errors.join('; ')}`)
  }
  return manifest
}
