/**
 * PlayPublisher — Google Play Android Publisher client (Phase 2).
 *
 * Reads a service-account JSON (GOOGLE_PLAY_SERVICE_ACCOUNT path), mints an
 * RS256 JWT for the androidpublisher scope, and exchanges it for an access
 * token. Uploads delegate to `fastlane supply` when Fastlane is present;
 * the direct API upload (edits/bundles endpoint) is exercised only when the
 * token exchange succeeds — never in tests or dry runs.
 */

import { createPrivateKey, createSign } from 'crypto'
import { readFileSync, existsSync } from 'fs'

export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri: string
}

export function loadServiceAccount(path: string): ServiceAccount {
  if (!existsSync(path)) throw new Error(`Service account JSON not found: ${path}`)
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ServiceAccount
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON missing client_email or private_key')
  }
  return parsed
}

/** Mint an RS256 Google service-account JWT for the given scope. */
export function mintServiceAccountJwt(account: ServiceAccount, scope: string, ttlSeconds = 3600): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: account.client_email,
    scope,
    aud: account.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + ttlSeconds,
  }
  const encode = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${encode(header)}.${encode(payload)}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const sig = signer.sign(createPrivateKey(account.private_key))
  return `${signingInput}.${Buffer.from(sig).toString('base64url')}`
}

/** Exchange the signed JWT for an OAuth access token (network). */
export async function exchangeAccessToken(account: ServiceAccount, scope: string): Promise<string> {
  const jwt = mintServiceAccountJwt(account, scope)
  const endpoint = account.token_uri || 'https://oauth2.googleapis.com/token'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  }
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('Token exchange returned no access_token')
  return body.access_token
}

export interface PlayUploadPlan {
  provider: 'fastlane' | 'play-api'
  command?: string
  track: 'internal' | 'alpha' | 'beta' | 'production'
  artifactPath: string
}

export function planPlayUpload(
  artifactPath: string,
  track: 'internal' | 'alpha' | 'beta' | 'production',
  context: { hasFastlane: boolean; serviceAccountPath?: string }
): PlayUploadPlan {
  if (context.hasFastlane) {
    return { provider: 'fastlane', command: `fastlane supply --track ${track} --aab ${artifactPath}`, track, artifactPath }
  }
  if (context.serviceAccountPath) {
    // Validate the service account loads (throws early when malformed).
    loadServiceAccount(context.serviceAccountPath)
    return { provider: 'play-api', track, artifactPath }
  }
  throw new Error('No Play Store credential provider detected')
}
