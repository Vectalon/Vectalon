/**
 * LicenseValidator — Offline JWT validation with embedded public key
 * Business Source License 1.1 (BSL-1.1)
 */

import { createPublicKey, verify } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { LicenseInfo, LicenseValidationResult } from './types'

function findPublicKey(): string {
  const candidates = [
    join(__dirname, '..', 'public-key.pem'),              // dist/auth/../
    join(__dirname, '..', '..', 'public-key.pem'),      // dist/auth/../../
    join(__dirname, '..', '..', '..', 'public-key.pem'), // src/auth/../../../
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8')
    }
  }
  throw new Error('public-key.pem not found in expected locations')
}

const PUBLIC_KEY_PEM = findPublicKey()

export class LicenseValidator {
  private static publicKey = createPublicKey(PUBLIC_KEY_PEM)

  static validate(token: string): LicenseValidationResult {
    try {
      const verified = verify(
        'SHA256',
        Buffer.from(token.split('.').slice(0, 2).join('.')),
        this.publicKey,
        Buffer.from(token.split('.')[2], 'base64')
      )

      if (!verified) {
        return { valid: false, error: 'Invalid license signature' }
      }

      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      )

      if (payload.exp * 1000 < Date.now()) {
        return { valid: false, error: 'License expired' }
      }

      const license: LicenseInfo = {
        key: token,
        tier: payload.tier,
        product: payload.product,
        issuedAt: payload.iat * 1000,
        expiresAt: payload.exp * 1000,
        githubUserId: payload.sub,
      }

      return { valid: true, license }
    } catch (err) {
      return { valid: false, error: `Invalid license: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  static isExpired(license: LicenseInfo): boolean {
    return license.expiresAt < Date.now()
  }

  static daysRemaining(license: LicenseInfo): number {
    return Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
  }
}
