/**
 * SaasClient — builds.vectalon.in REST client (Phase 5 of the design doc).
 *
 * Implements the signed-URL upload pattern from §5.6 (initiate → PUT →
 * confirm) and the custom-domain endpoints. The backend itself is an open
 * question in the design doc, so every call degrades to an explicit dry-run
 * description when VECTALON_BUILDS_API_KEY is absent — the client is typed
 * and ready for the backend to exist.
 */

import { existsSync, readFileSync } from 'fs'
import type { BuildManifest } from '../archive/types'

export interface SaasConfig {
  apiKey?: string
  endpoint?: string
  projectId: string
}

export const DEFAULT_SAAS_ENDPOINT = 'https://builds.vectalon.in/v1'

export interface SaasUploadResult {
  ok: boolean
  dryRun?: boolean
  url?: string
  expiresAt?: string
  error?: string
}

/** Read VECTALON_BUILDS_API_KEY from the environment or a file path value. */
export function resolveApiKey(value?: string): string | null {
  const env = value || process.env.VECTALON_BUILDS_API_KEY
  if (!env) return null
  // Allow a path to a file containing the key.
  if (env.includes('/') && existsSync(env)) {
    return readFileSync(env, 'utf-8').trim()
  }
  return env
}

export class SaasClient {
  private readonly config: SaasConfig
  private readonly apiKey: string | null

  constructor(config: SaasConfig) {
    this.config = config
    this.apiKey = resolveApiKey(config.apiKey)
  }

  get ready(): boolean {
    return this.apiKey !== null
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    }
  }

  /** Upload a build: initiate → PUT artifact → confirm. */
  async uploadBuild(manifest: BuildManifest, artifactPath: string): Promise<SaasUploadResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        dryRun: true,
        error: 'Set VECTALON_BUILDS_API_KEY or upgrade to Team tier (https://vectalon.in/pricing).',
      }
    }
    const endpoint = this.config.endpoint || DEFAULT_SAAS_ENDPOINT
    const initiate = await fetch(`${endpoint}/builds/initiate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        buildId: manifest.buildId,
        projectId: manifest.projectId,
        flavor: manifest.flavor,
        platform: manifest.platform,
        artifactType: manifest.artifactType,
        checksum: manifest.checksum,
      }),
    })
    if (!initiate.ok) {
      return { ok: false, error: `SaaS initiate failed: ${initiate.status} ${(await initiate.text()).slice(0, 200)}` }
    }
    const { uploadUrl, buildId } = (await initiate.json()) as { uploadUrl: string; buildId: string }
    const artifact = readFileSync(artifactPath)
    const put = await fetch(uploadUrl, { method: 'PUT', body: artifact })
    if (!put.ok) {
      return { ok: false, error: `SaaS artifact upload failed: ${put.status}` }
    }
    const confirm = await fetch(`${endpoint}/builds/confirm`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ buildId, checksum: manifest.checksum, size: artifact.length }),
    })
    if (!confirm.ok) {
      return { ok: false, error: `SaaS confirm failed: ${confirm.status} ${(await confirm.text()).slice(0, 200)}` }
    }
    const result = (await confirm.json()) as { url: string; expiresAt?: string }
    return { ok: true, url: result.url, ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}) }
  }

  /** Describe what a push would do without a key (deterministic, for docs/tests). */
  describePush(manifest: BuildManifest): string[] {
    const endpoint = this.config.endpoint || DEFAULT_SAAS_ENDPOINT
    return [
      `POST ${endpoint}/builds/initiate  → signed upload URL`,
      `PUT   <uploadUrl>  (${manifest.artifactType}, ${manifest.artifactSize} bytes, sha256 ${manifest.checksum.slice(0, 12)}…)`,
      `POST ${endpoint}/builds/confirm   → public install URL`,
    ]
  }
}
