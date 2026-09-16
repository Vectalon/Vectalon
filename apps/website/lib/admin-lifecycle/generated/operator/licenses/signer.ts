import { createPrivateKey, sign } from "node:crypto"
import type { LicenseClaimsV2 } from "./types"

/** A custody boundary: callers can request a signature, never obtain key material. */
export interface LicenseSigner {
  readonly keyId: string
  signClaims(claims: LicenseClaimsV2): Promise<string>
}

export interface KmsSigningClient {
  sign(input: { keyRef: string; algorithm: "RSASSA_PKCS1_V1_5_SHA_256"; message: Uint8Array }): Promise<Uint8Array>
}

export class KmsLicenseSigner implements LicenseSigner {
  readonly keyId: string
  #keyRef: string
  #client: KmsSigningClient
  constructor(keyId: string, keyRef: string, client: KmsSigningClient) { this.keyId = keyId; this.#keyRef = keyRef; this.#client = client }
  async signClaims(claims: LicenseClaimsV2): Promise<string> {
    const input = signingInput(claims, this.keyId)
    const signature = await this.#client.sign({ keyRef: this.#keyRef, algorithm: "RSASSA_PKCS1_V1_5_SHA_256", message: Buffer.from(input, "ascii") })
    return `${input}.${Buffer.from(signature).toString("base64url")}`
  }
}

/** Transitional server-only adapter. VECTALON_LICENSE_PRIVATE_KEY must be a deployment secret. */
export class EnvironmentRsaLicenseSigner implements LicenseSigner {
  readonly keyId: string
  #privateKeyPem: string
  constructor(keyId: string, privateKeyPem: string) { this.keyId = keyId; this.#privateKeyPem = privateKeyPem }
  async signClaims(claims: LicenseClaimsV2): Promise<string> {
    const key = createPrivateKey(this.#privateKeyPem.replace(/\\n/g, "\n"))
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("license-signing-key-invalid")
    const input = signingInput(claims, this.keyId)
    return `${input}.${sign("RSA-SHA256", Buffer.from(input, "ascii"), key).toString("base64url")}`
  }
}

export function signerFromEnvironment(environment: NodeJS.ProcessEnv = process.env): LicenseSigner {
  const keyId = environment.VECTALON_KEY_ID
  const privateKey = environment.VECTALON_LICENSE_PRIVATE_KEY
  if (!keyId || !privateKey) throw new Error("license-signing-unavailable")
  return new EnvironmentRsaLicenseSigner(keyId, privateKey)
}

function signingInput(claims: LicenseClaimsV2, keyId: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "RS256", kid: keyId, typ: "vectalon-license+jwt" })}.${encode(claims)}`
}
