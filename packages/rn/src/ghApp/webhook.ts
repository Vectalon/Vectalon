/**
 * vectalon gh-app — GitHub webhook verification + event shaping.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Every webhook POST carries `X-Hub-Signature-256: sha256=<hmac>` computed over
 * the RAW body with the app's webhook secret. We recompute and compare with a
 * constant-time equality before touching the payload. Only `pull_request`
 * events that change the code shape (opened / synchronize / reopened /
 * ready_for_review) trigger a review; the rest are acknowledged and skipped.
 */
import { createHmac, timingSafeEqual } from 'crypto'

export const PR_REVIEW_ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review'])

/** Constant-time check of the `X-Hub-Signature-256` header against the raw body. */
export function verifyWebhookSignature(secret: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** The part of a pull_request webhook the app acts on. */
export interface PullRequestWebhook {
  action?: string
  pull_request?: {
    number?: number
    title?: string | null
    head?: { sha?: string; ref?: string }
    base?: { ref?: string }
  }
  repository?: { owner?: { login?: string }; name?: string }
  installation?: { id?: number }
}

/** True when the event should trigger a deterministic PR review. */
export function isReviewablePullRequest(payload: PullRequestWebhook): boolean {
  if (!payload.pull_request?.number) return false
  if (!payload.repository?.owner?.login || !payload.repository.name) return false
  if (!payload.pull_request.base?.ref || !payload.pull_request.head?.sha) return false
  if (!PR_REVIEW_ACTIONS.has(payload.action ?? '')) return false
  return true
}

/** The minimal fields the orchestration needs, validated. */
export function reviewableFields(payload: PullRequestWebhook): {
  owner: string
  repo: string
  number: number
  baseRef: string
  headSha: string
  installationId: number | null
} | null {
  if (!isReviewablePullRequest(payload)) return null
  const owner = payload.repository!.owner!.login!
  const repo = payload.repository!.name!
  const number = payload.pull_request!.number!
  const baseRef = payload.pull_request!.base!.ref!
  const headSha = payload.pull_request!.head!.sha!
  const installationId = payload.installation?.id ?? null
  return { owner, repo, number, baseRef, headSha, installationId }
}
