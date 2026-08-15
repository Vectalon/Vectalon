/**
 * CredentialDelegator — never stores credentials (Phase 2).
 *
 * Detects which distribution credential provider is available for a project
 * and produces the exact delegation command or, when nothing is available,
 * actionable setup instructions (per ARCHIVE_AND_SHARE_DESIGN.md §5.5).
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export type CredentialProvider = 'fastlane' | 'eas' | 'expo' | 'asc-api' | 'play-api' | 'none'

export interface CredentialInfo {
  provider: CredentialProvider
  detectedVia: string
  /** The command to run for delegation (fastlane/eas/expo), when applicable. */
  delegationCommand?: string
  /** Env vars the direct API path needs. */
  requiredEnv: string[]
  /** Human instructions when provider === 'none'. */
  instructions?: string
}

export interface DelegationOptions {
  root: string
  platform: 'ios' | 'android'
  target: 'testflight' | 'play-store'
}

function hasFastlane(root: string): boolean {
  if (existsSync(join(root, 'fastlane'))) return true
  const gemfile = join(root, 'Gemfile')
  if (existsSync(gemfile)) {
    try {
      return /fastlane/.test(readFileSync(gemfile, 'utf-8'))
    } catch {
      return false
    }
  }
  return false
}

export function hasEas(root: string): boolean {
  return existsSync(join(root, 'eas.json'))
}

export function hasExpo(root: string): boolean {
  const pkg = join(root, 'package.json')
  if (!existsSync(pkg)) return false
  try {
    const parsed = JSON.parse(readFileSync(pkg, 'utf-8')) as { dependencies?: Record<string, unknown> }
    return !!parsed.dependencies && 'expo' in parsed.dependencies
  } catch {
    return false
  }
}

export function ascApiKeyPresent(): boolean {
  return Boolean(process.env.APP_STORE_CONNECT_API_KEY && process.env.APP_STORE_CONNECT_ISSUER_ID && process.env.APP_STORE_CONNECT_KEY_ID)
}

export function playApiKeyPresent(): boolean {
  return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT)
}

/** Detect the best credential provider for a distribution target. */
export function detectCredentials(options: DelegationOptions): CredentialInfo {
  const { root, platform, target } = options

  if (target === 'testflight') {
    if (hasFastlane(root)) {
      return {
        provider: 'fastlane',
        detectedVia: 'fastlane/ directory or Gemfile',
        delegationCommand: 'fastlane pilot upload',
        requiredEnv: ['FASTLANE_PASSWORD'],
      }
    }
    if (hasEas(root)) {
      return {
        provider: 'eas',
        detectedVia: 'eas.json',
        delegationCommand: `eas submit --platform ${platform}`,
        requiredEnv: ['EXPO_TOKEN'],
      }
    }
    if (hasExpo(root)) {
      return {
        provider: 'expo',
        detectedVia: 'expo dependency in package.json',
        delegationCommand: 'expo upload:submission',
        requiredEnv: ['EXPO_TOKEN'],
      }
    }
    if (ascApiKeyPresent()) {
      return {
        provider: 'asc-api',
        detectedVia: 'APP_STORE_CONNECT_API_KEY / ISSUER_ID / KEY_ID env vars',
        requiredEnv: ['APP_STORE_CONNECT_API_KEY', 'APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_KEY_ID'],
      }
    }
    return {
      provider: 'none',
      detectedVia: 'no provider detected',
      requiredEnv: [],
      instructions: [
        'No credential provider detected. To distribute to TestFlight, either:',
        '  1. Install Fastlane and run `fastlane init` in your ios/ directory, or',
        '  2. Set APP_STORE_CONNECT_API_KEY / APP_STORE_CONNECT_ISSUER_ID / APP_STORE_CONNECT_KEY_ID for direct API access.',
      ].join('\n'),
    }
  }

  // play-store
  if (hasFastlane(root)) {
    return {
      provider: 'fastlane',
      detectedVia: 'fastlane/ directory or Gemfile',
      delegationCommand: 'fastlane supply',
      requiredEnv: ['GOOGLE_PLAY_SERVICE_ACCOUNT'],
    }
  }
  if (hasEas(root)) {
    return {
      provider: 'eas',
      detectedVia: 'eas.json',
      delegationCommand: `eas submit --platform ${platform}`,
      requiredEnv: ['EXPO_TOKEN'],
    }
  }
  if (playApiKeyPresent()) {
    return {
      provider: 'play-api',
      detectedVia: 'GOOGLE_PLAY_SERVICE_ACCOUNT env var',
      requiredEnv: ['GOOGLE_PLAY_SERVICE_ACCOUNT'],
    }
  }
  return {
    provider: 'none',
    detectedVia: 'no provider detected',
    requiredEnv: [],
    instructions: [
      'No credential provider detected. To distribute to the Play Store, either:',
      '  1. Install Fastlane and run `fastlane init` in your android/ directory, or',
      '  2. Set GOOGLE_PLAY_SERVICE_ACCOUNT to a service-account JSON path for direct API access.',
    ].join('\n'),
  }
}
