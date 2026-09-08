import { generateKeyPairSync, sign } from 'crypto'
import { createCustomerLicenseVerifier, evaluateCustomerTier, LicenseLifecycleStore } from '../../src/auth/licenseLifecycle'
import { cleanup, createTempProject } from '../helpers/tmp'

const NOW = 1_800_000_000_000
const DAY = 86_400_000

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

describe('V2 lifecycle entitlement gate', () => {
  it('allows a paid CLI command from the selected V2 lease instead of the legacy license file', () => {
    const directory = createTempProject({})
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const key = { id: 'paid-command-key', algorithm: 'RS256' as const, status: 'active' as const, publicKey: pair.publicKey }
    const payload = {
      license_version: 2, jti: 'license-paid-command', iss: 'https://licenses.vectalon.dev', aud: 'vectalon-cli',
      sub: 'customer-paid-command', product: ['rn'], tier: 'team', seats: 2, state: 'active', revision: 1,
      iat: NOW / 1000, nbf: NOW / 1000, exp: (NOW + 30 * DAY) / 1000,
    }
    const input = `${encode({ alg: 'RS256', kid: key.id, typ: 'vectalon-license+jwt' })}.${encode(payload)}`
    const token = `${input}.${sign('RSA-SHA256', Buffer.from(input, 'ascii'), pair.privateKey).toString('base64url')}`
    const verify = createCustomerLicenseVerifier({ keys: [key], now: () => NOW })
    const store = new LicenseLifecycleStore({ directory, legacyPaths: [] })

    try {
      expect(store.save(token, verify, NOW)).toEqual({ ok: true })
      expect(evaluateCustomerTier('pro', { store, verify, now: () => NOW })).toMatchObject({ allowed: true, currentTier: 'team', requiredTier: 'pro' })
      expect(evaluateCustomerTier('enterprise', { store, verify, now: () => NOW })).toMatchObject({ allowed: false, currentTier: 'team', requiredTier: 'enterprise' })
    } finally {
      cleanup(directory)
    }
  })
})
