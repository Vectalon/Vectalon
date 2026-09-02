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

  test('rejects invalid intervals and private keys weaker than RSA-2048', () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const privateKey = weak.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const input = {
      subject: 'buyer@example.test',
      tier: 'pro',
      product: 'rn',
      issuedAt: 1_800_000_000_000,
      expiresAt: 1_900_000_000_000,
    }

    expect(() => signLicenseToken(input, privateKey, 'weak')).toThrow('license-signing-key-invalid')
    expect(() => signLicenseToken({ ...input, expiresAt: input.issuedAt }, privateKey, 'weak')).toThrow('license-interval-invalid')
  })
})
