import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
export type OperatorBrowserChallenge = Readonly<{ deviceCode: string; nonce: string; origin: string; createdAt: number; expiresAt: number; interval: number }>
const context = Buffer.from("vectalon-operator-github-challenge/v1")
function key(secret: string): Buffer {
  if (secret.length < 32) throw new Error("operator-challenge-unavailable")
  return createHash("sha256").update(context).update(secret).digest()
}
function valid(value: OperatorBrowserChallenge, origin: string, now: number): boolean {
  return typeof value.deviceCode === "string" && /^[A-Za-z0-9_-]{20,256}$/.test(value.deviceCode)
    && typeof value.nonce === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.nonce)
    && value.origin === origin && Number.isSafeInteger(now) && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.expiresAt)
    && value.createdAt <= now && value.expiresAt > now && value.expiresAt <= value.createdAt + 1_800_000
    && Number.isInteger(value.interval) && value.interval >= 5 && value.interval <= 60
}
export function sealOperatorChallenge(challenge: OperatorBrowserChallenge, secret: string): string {
  if (!valid(challenge, challenge.origin, challenge.createdAt)) throw new Error("operator-challenge-invalid")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv)
  cipher.setAAD(context)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(challenge), "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".")
}
export function openOperatorChallenge(sealed: string, secret: string, origin: string, now: number): OperatorBrowserChallenge | null {
  try {
    if (sealed.length > 4096) return null
    const parts = sealed.split(".")
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null
    const iv = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url")
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv)
    decipher.setAAD(context); decipher.setAuthTag(tag)
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8")) as OperatorBrowserChallenge
    return value && valid(value, origin, now) ? value : null
  } catch { return null }
}
