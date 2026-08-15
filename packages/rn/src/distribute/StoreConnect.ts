/**
 * StoreConnect — App Store Connect client (Phase 2).
 *
 * Never stores credentials: reads the API key file from
 * APP_STORE_CONNECT_API_KEY at call time, mints a short-lived ES256 JWT
 * (issuer/key from APP_STORE_CONNECT_ISSUER_ID / APP_STORE_CONNECT_KEY_ID),
 * and delegates the actual upload to `fastlane pilot` when Fastlane is
 * present. The JWT minting is real and hermetic-testable; uploads only run
 * against Apple when a credential provider is present (never in tests).
 */

import { createPrivateKey, createSign } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { runCommand } from '../adapters/runCommand'

export interface AscJwtOptions {
  keyPath: string
  issuerId: string
  keyId: string
  ttlSeconds?: number
}

/** Convert an ASN.1 DER ECDSA signature into raw r||s (JWT ES256 format). */
export function derToRawJwt(dersig: Buffer): Buffer {
  // DER: 30 <len> 02 <rlen> <r> 02 <slen> <s>
  if (dersig[0] !== 0x30) throw new Error('Not a DER ECDSA signature')
  // Header is 2 bytes (0x30, len); long-form length adds 1-2 extra bytes.
  let offset = 2 + (dersig[1] === 0x81 ? 1 : dersig[1] === 0x82 ? 2 : 0)
  if (dersig[offset] !== 0x02) throw new Error('Bad DER: expected INTEGER r')
  const rLen = dersig[offset + 1]
  const rStart = offset + 2
  const r = dersig.subarray(rStart, rStart + rLen)
  offset = rStart + rLen
  if (dersig[offset] !== 0x02) throw new Error('Bad DER: expected INTEGER s')
  const sLen = dersig[offset + 1]
  const s = dersig.subarray(offset + 2, offset + 2 + sLen)

  const toFixed = (buf: Buffer, size: number): Buffer => {
    // Strip leading zeros then left-pad to the field size.
    let b = buf
    while (b.length > 1 && b[0] === 0) b = b.subarray(1)
    if (b.length > size) throw new Error(`Integer overflows field size (${b.length} > ${size})`)
    return Buffer.concat([Buffer.alloc(size - b.length), b])
  }
  return Buffer.concat([toFixed(r, 32), toFixed(s, 32)])
}

/** Mint an App Store Connect API JWT (ES256, raw r||s signature). */
export function mintAscJwt(options: AscJwtOptions): string {
  if (!existsSync(options.keyPath)) throw new Error(`ASC API key not found: ${options.keyPath}`)
  const pem = readFileSync(options.keyPath, 'utf-8')
  const header = { alg: 'ES256', kid: options.keyId, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const ttl = options.ttlSeconds ?? 1200
  const payload = { iss: options.issuerId, iat: now, exp: now + ttl, aud: 'appstoreconnect-v1' }
  const encode = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${encode(header)}.${encode(payload)}`
  const signer = createSign('sha256')
  signer.update(signingInput)
  signer.end()
  const der = signer.sign(createPrivateKey(pem))
  const raw = derToRawJwt(der)
  return `${signingInput}.${Buffer.from(raw).toString('base64url')}`
}

export interface TestFlightUploadPlan {
  provider: 'fastlane' | 'asc-api'
  command?: string
  jwt?: string
  artifactPath: string
}

/** Build the upload plan for TestFlight (no network unless executed). */
export function planTestFlightUpload(
  artifactPath: string,
  context: {
    hasFastlane: boolean
    fastlanePassword?: string
    ascKeyPath?: string
    ascIssuerId?: string
    ascKeyId?: string
  }
): TestFlightUploadPlan {
  if (context.hasFastlane) {
    const command = `fastlane pilot upload -i ${artifactPath}`
    return { provider: 'fastlane', command, artifactPath }
  }
  if (context.ascKeyPath && context.ascIssuerId && context.ascKeyId) {
    const jwt = mintAscJwt({ keyPath: context.ascKeyPath, issuerId: context.ascIssuerId, keyId: context.ascKeyId })
    return { provider: 'asc-api', jwt, artifactPath }
  }
  throw new Error('No TestFlight credential provider detected')
}

/** Execute the plan (fastlane delegation). Returns the command result. */
export async function executeTestFlightUpload(plan: TestFlightUploadPlan): Promise<{ success: boolean; stdout: string; stderr: string }> {
  if (plan.provider === 'fastlane' && plan.command) {
    const result = await runCommand('bash', ['-c', plan.command], { cwd: process.cwd() })
    return { success: result.success, stdout: result.stdout, stderr: result.stderr }
  }
  // Direct API path requires the App Store Connect upload/transporter flow;
  // the JWT is minted and ready — surface it for the API call.
  return { success: false, stdout: '', stderr: 'Direct ASC API upload requires the Transporter/altool flow with a minted JWT.' }
}
