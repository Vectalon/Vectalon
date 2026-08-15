/**
 * Archive & Share — shared types (Phase 1 foundation).
 *
 * Mirrors the ARCHIVE_AND_SHARE_DESIGN.md §3.1 BuildManifest shape. No
 * external validation dependency: see BuildManifest.ts for the hand-rolled
 * validator (the package is intentionally dependency-light).
 */

export type PlatformName = 'ios' | 'android'
export type ArtifactType = 'ipa' | 'apk' | 'aab'

export interface FlavorConfig {
  name: string
  android?: string
  ios?: string
  envFile?: string
  envVars?: Record<string, string>
  isDefault?: boolean
}

export interface BuildMetadata {
  xcodeVersion?: string
  androidSdkVersion?: string
  reactNativeVersion?: string
  expoSdkVersion?: string
  metroVersion?: string
  gradleVersion?: string
  nodeVersion: string
  nativeConfig: Record<string, unknown>
}

export interface BuildSignatures {
  enterprise?: string
  adHoc?: string
  appStore?: string
  playStore?: string
}

export interface TestFlightDistribution {
  buildId: string
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  uploadDate: string
  appleId?: string
}

export interface PlayStoreDistribution {
  track: 'internal' | 'alpha' | 'beta' | 'production'
  versionCode: number
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  uploadDate: string
}

export interface SaasDistribution {
  url: string
  expiresAt?: string
  access: 'public' | 'team' | 'private'
}

export interface PortalDistribution {
  domain: string
  url: string
  deployedAt: string
}

export interface DistributionRecord {
  testflight?: TestFlightDistribution
  playStore?: PlayStoreDistribution
  saas?: SaasDistribution
  portal?: PortalDistribution
}

export interface BuildManifest {
  buildId: string
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
  buildTimestamp: string
  builtBy: string
  buildDurationMs?: number
  metadata: BuildMetadata
  signatures?: BuildSignatures
  distribution?: DistributionRecord
}

export interface ArchiveCommandResult {
  manifest: BuildManifest
  reportPath: string
  artifactPath: string
  duplicated?: boolean
  existingBuildId?: string
}

export interface BuildTarget {
  projectType: 'expo' | 'bare' | 'unknown'
  buildCommand: string
  artifactGlobs: string[]
}

export interface FlavorDetectResult {
  flavors: FlavorConfig[]
  source: 'auto-detected' | 'user-config' | 'mixed'
  note?: string
}
