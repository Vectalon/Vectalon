import type { BuildManifest, DistributionRecord } from '../archive/types'

export type DistributeTarget = 'testflight' | 'play-store' | 'saas' | 'portal'
export type PlayTrack = 'internal' | 'alpha' | 'beta' | 'production'

export interface DistributeOptions {
  buildId?: string
  latest?: boolean
  flavor?: string
  platform?: 'ios' | 'android'
  target: DistributeTarget
  track?: PlayTrack
  domain?: string
  dryRun?: boolean
  portalOut?: string
}

export interface DistributeReport {
  ok: boolean
  dryRun?: boolean
  error?: string
  build?: BuildManifest
  target: DistributeTarget
  plan?: string[]
  distribution?: DistributionRecord
  reportPath: string
}
