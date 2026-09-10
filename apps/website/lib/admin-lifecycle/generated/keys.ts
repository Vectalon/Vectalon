import { createPrivateKey, createPublicKey } from "node:crypto"

/** `overlap` is an Admin rollout phase; it is deliberately never sent to Core. */
export type KeyStatus = "active" | "overlap" | "retired" | "compromised"
export type KeyMetadata = Readonly<{ id: string; publicKeyPem: string; status: KeyStatus; createdAt: number; activatedAt: number | null; retiredAt: number | null; compromisedAt: number | null }>
export type CoreVerificationKey = Readonly<{ id: string; algorithm: "RS256"; status: "active" | "retired" | "compromised"; publicKey: string }>

export function transitionKeyStatus(key: KeyMetadata, next: KeyStatus, now: number): KeyMetadata {
  if (key.status === "compromised") throw new Error("compromised-key-cannot-be-restored")
  if (key.status === "retired" && (next === "active" || next === "overlap")) throw new Error("retired-key-cannot-be-reactivated")
  if (next === "compromised") return { ...key, status: next, compromisedAt: now, retiredAt: key.retiredAt ?? now }
  if (next === "retired") return { ...key, status: next, retiredAt: now }
  return { ...key, status: next, activatedAt: key.activatedAt ?? now }
}

export function signingKey(keys: readonly KeyMetadata[]): KeyMetadata | null {
  return keys.find(key => key.status === "active") ?? null
}

export function verificationKeys(keys: readonly KeyMetadata[]): readonly KeyMetadata[] {
  return keys.filter(key => key.status === "active" || key.status === "overlap").map(key => Object.freeze({ ...key, publicKeyPem: validatePublicKey(key.publicKeyPem) }))
}

/** Project Admin overlap into the only status Core accepts: an active public verifier. */
export function coreVerificationKeys(keys: readonly KeyMetadata[]): readonly CoreVerificationKey[] {
  return keys.filter(key => key.status === "active" || key.status === "overlap").map(key => Object.freeze({ id: key.id, algorithm: "RS256" as const, status: "active" as const, publicKey: validatePublicKey(key.publicKeyPem) }))
}

/** Refuse private, encrypted-private, non-RSA, and undersized material at the public registry boundary. */
export function validatePublicKey(pem: string): string {
  if (typeof pem !== "string" || /^-----BEGIN [^-]*PRIVATE KEY-----/m.test(pem)) throw new Error("public-key-invalid")
  try {
    try { createPrivateKey(pem); throw new Error("public-key-invalid") } catch (error) { if (error instanceof Error && error.message === "public-key-invalid") throw error }
    const key = createPublicKey(pem)
    if (key.type !== "public" || key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("public-key-invalid")
    return key.export({ type: "spki", format: "pem" }).toString()
  } catch { throw new Error("public-key-invalid") }
}
