import { createPrivateKey, sign } from 'crypto'

export interface LicenseTokenInput {
  subject: string
  tier: string
  product: string | string[]
  issuedAt: number
  expiresAt: number
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function signLicenseToken(
  input: LicenseTokenInput,
  privateKeyPem: string,
  keyId: string
): string {
  if (
    !input.subject ||
    !input.tier ||
    (typeof input.product === 'string' ? !input.product : input.product.length === 0) ||
    !Number.isSafeInteger(input.issuedAt) ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.issuedAt < 0 ||
    input.expiresAt <= input.issuedAt
  ) {
    throw new Error('license-interval-invalid')
  }
  if (!keyId.trim()) throw new Error('license-signing-key-id-missing')

  let privateKey
  try {
    privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'))
  } catch {
    throw new Error('license-signing-key-invalid')
  }
  if (
    privateKey.asymmetricKeyType !== 'rsa' ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  ) {
    throw new Error('license-signing-key-invalid')
  }

  const header = encode({ alg: 'RS256', kid: keyId.trim(), typ: 'JWT' })
  const payload = encode({
    sub: input.subject,
    tier: input.tier,
    product: input.product,
    iat: Math.floor(input.issuedAt / 1000),
    exp: Math.floor(input.expiresAt / 1000),
  })
  const signingInput = `${header}.${payload}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}
