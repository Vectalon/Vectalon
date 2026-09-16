import { verifyGitHubIdentity, type VerifiedProviderIdentity } from "../trials/issuance"
type GitHubPoll = { status: "complete"; identity: VerifiedProviderIdentity } | { status: "pending" | "denied" | "expired" | "unavailable" } | { status: "slow_down"; interval: number }
async function post(path: string, body: Record<string, string>, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(`https://github.com/login/${path}`, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(10_000), redirect: "error" })
  if (!response.ok) throw new Error("operator-provider-unavailable")
  const value: unknown = await response.json()
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("operator-provider-unavailable")
  return value as Record<string, unknown>
}
function clientIdValid(clientId: string): boolean { return /^[A-Za-z0-9]{10,100}$/.test(clientId) }
export async function startOperatorGitHub(clientId: string, fetcher: typeof fetch = fetch): Promise<{ deviceCode: string; userCode: string; verificationUri: "https://github.com/login/device"; expiresIn: number; interval: number }> {
  try {
    if (!clientIdValid(clientId)) throw new Error()
    const value = await post("device/code", { client_id: clientId }, fetcher)
    if (typeof value.device_code !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(value.device_code)
      || typeof value.user_code !== "string" || !/^[A-Z0-9-]{4,32}$/.test(value.user_code) || value.verification_uri !== "https://github.com/login/device"
      || typeof value.expires_in !== "number" || !Number.isInteger(value.expires_in) || value.expires_in < 60 || value.expires_in > 1800
      || typeof value.interval !== "number" || !Number.isInteger(value.interval) || value.interval < 5 || value.interval > 60) throw new Error()
    return { deviceCode: value.device_code, userCode: value.user_code, verificationUri: value.verification_uri, expiresIn: value.expires_in, interval: value.interval }
  } catch { throw new Error("operator-provider-unavailable") }
}
export async function pollOperatorGitHub(deviceCode: string, clientId: string, fetcher: typeof fetch = fetch): Promise<GitHubPoll> {
  try {
    if (!clientIdValid(clientId) || !/^[A-Za-z0-9_-]{20,256}$/.test(deviceCode)) return { status: "unavailable" }
    const value = await post("oauth/access_token", { client_id: clientId, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }, fetcher)
    if (value.error === "authorization_pending") return { status: "pending" }
    if (value.error === "slow_down") return { status: "slow_down", interval: typeof value.interval === "number" && Number.isInteger(value.interval) && value.interval >= 5 && value.interval <= 60 ? value.interval : 10 }
    if (value.error === "access_denied") return { status: "denied" }
    if (value.error === "expired_token") return { status: "expired" }
    if (value.error || value.token_type !== "bearer" || typeof value.access_token !== "string") return { status: "unavailable" }
    return { status: "complete", identity: await verifyGitHubIdentity(value.access_token, fetcher) }
  } catch { return { status: "unavailable" } }
}
