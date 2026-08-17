/**
 * vectalon gh-app — GitHub App authentication.
 * Business Source License 1.1 (BSL-1.1)
 *
 * A GitHub App authenticates as itself with a short-lived RS256 JWT signed by
 * the app's private key (`iss` = app id), then exchanges that JWT for an
 * installation access token (`POST /app/installations/{id}/access_tokens`)
 * scoped to one installation. All crypto is Node's built-in `crypto`; the only
 * network call is a single `fetch` to api.github.com.
 */
import { createSign } from 'crypto'

/** Minimum viable App JWT — 10 minutes, clock skew grace. RS256 via the app PEM. */
export function createAppJwt(appId: string, privateKeyPem: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = { iat: nowSec - 60, exp: nowSec + 10 * 60, iss: appId }
  const enc = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${enc(header)}.${enc(payload)}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem)
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`
}

export interface InstallationTokenOptions {
  appId: string
  privateKeyPem: string
  installationId: string
  /** Injectable fetch (hermetic tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch
  apiBase?: string
  log?: { warn: (m: string) => void }
}

/** Exchange the app JWT for an installation access token (never cached here — the caller may). */
export async function getInstallationToken(options: InstallationTokenOptions): Promise<string> {
  const { appId, privateKeyPem, installationId, apiBase = 'https://api.github.com' } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const jwt = createAppJwt(appId, privateKeyPem)
  const res = await fetchImpl(`${apiBase}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vectalon-ghapp',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    options.log?.warn(`Installation token request failed: HTTP ${res.status} ${text.slice(0, 300)}`)
    throw new Error(`GitHub App installation token failed (HTTP ${res.status})`)
  }
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error('GitHub App installation token response had no token')
  return body.token
}
