import { createHash } from "node:crypto"

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000
export const TRIAL_POLICY_VERSION = "2026-09-04.1"

export interface VerifiedProviderIdentity {
  provider: "github"
  providerSubjectId: string
  displayName: string
}

export interface TrialClaimsInput {
  trialId: string
  subjectId: string
  audience: "vectalon-sdk"
  productScope: readonly string[]
  tier: "pro" | "team"
  issuedAt: number
  notBefore: number
  expiresAt: number
  policyVersion: string
}

export interface TrialRepository {
  create(input: VerifiedProviderIdentity & TrialClaimsInput & { requestHash: string }): Promise<"created" | "duplicate" | "replay">
}

export interface TrialIssuanceDependencies {
  verifyIdentity(accessToken: string): Promise<VerifiedProviderIdentity>
  repository: TrialRepository
  sign(claims: TrialClaimsInput): string
  randomId(): string
}

export async function verifyGitHubIdentity(accessToken: string, fetcher: typeof fetch = fetch): Promise<VerifiedProviderIdentity> {
  if (!accessToken || accessToken.length > 4096) throw new Error("provider-token-invalid")
  const response = await fetcher("https://api.github.com/user", {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${accessToken}`, "x-github-api-version": "2022-11-28" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error("provider-identity-unavailable")
  const value: unknown = await response.json()
  if (!value || typeof value !== "object" || !Number.isSafeInteger((value as { id?: unknown }).id) || ((value as { id: number }).id < 1)
    || typeof (value as { login?: unknown }).login !== "string" || !(value as { login: string }).login.trim()) {
    throw new Error("provider-identity-invalid")
  }
  return { provider: "github", providerSubjectId: String((value as { id: number }).id), displayName: (value as { login: string }).login }
}

export async function issueVerifiedTrial(
  input: { accessToken: string; requestId: string; tier: "pro" | "team"; product: string; now: number },
  dependencies: TrialIssuanceDependencies,
): Promise<{ status: "issued"; credential: string; expiresAt: number } | { status: "already_used" | "replay" }> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.requestId) || input.product !== "rn" || input.tier !== "pro" || !Number.isSafeInteger(input.now) || input.now < 0) {
    throw new Error("trial-request-invalid")
  }
  const identity = await dependencies.verifyIdentity(input.accessToken)
  const trialId = dependencies.randomId()
  const claims: TrialClaimsInput = {
    trialId,
    subjectId: `github:${identity.providerSubjectId}`,
    audience: "vectalon-sdk",
    productScope: [input.product],
    tier: input.tier,
    issuedAt: input.now,
    notBefore: input.now,
    expiresAt: input.now + TRIAL_MS,
    policyVersion: TRIAL_POLICY_VERSION,
  }
  const credential = dependencies.sign(claims)
  const result = await dependencies.repository.create({ ...identity, ...claims, requestHash: createHash("sha256").update(input.requestId).digest("hex") })
  if (result === "replay") return { status: "replay" }
  if (result === "duplicate") return { status: "already_used" }
  return { status: "issued", credential, expiresAt: claims.expiresAt }
}
