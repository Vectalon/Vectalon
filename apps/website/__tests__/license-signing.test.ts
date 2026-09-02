import { generateKeyPairSync } from 'crypto'
import { verifyLicenseToken } from '@vectalon-dev/core'
import { signLicenseToken } from '../lib/license-signing'

describe('signLicenseToken', () => {
  test('issues an RS256 credential accepted by the bundled Core verifier', () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const token = signLicenseToken({
      subject: 'buyer@example.test',
      tier: 'pro',
      product: 'rn',
      issuedAt: 1_800_000_000_000,
      expiresAt: 1_900_000_000_000,
    }, privateKey, 'production-1')

    const result = verifyLicenseToken(token, {
      id: 'production-1',
      algorithm: 'RS256',
      publicKey: pair.publicKey,
    }, 1_850_000_000_000)
    expect(result.ok).toBe(true)
  })

  test('rejects invalid intervals and non-RSA private keys', () => {
    const unsupported = generateKeyPairSync('ed25519')
    const privateKey = unsupported.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const input = {
      subject: 'buyer@example.test',
      tier: 'pro',
      product: 'rn',
      issuedAt: 1_800_000_000_000,
      expiresAt: 1_900_000_000_000,
    }

    expect(() => signLicenseToken(input, privateKey, 'unsupported')).toThrow('license-signing-key-invalid')
    expect(() => signLicenseToken({ ...input, expiresAt: input.issuedAt }, privateKey, 'unsupported')).toThrow('license-interval-invalid')
  })
})
