/**
 * vectalon gh-app — webhook hermetic tests: constant-time HMAC verification
 * and the pull_request event/action filter.
 * Business Source License 1.1 (BSL-1.1)
 */
import { createHmac } from 'crypto'
import { isReviewablePullRequest, reviewableFields, verifyWebhookSignature } from '../../src/ghApp/webhook'

const SECRET = 'webhook-secret'
const raw = Buffer.from('{"action":"opened"}')
const sig = (body: Buffer, secret = SECRET): string => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const PR = {
  action: 'opened',
  pull_request: { number: 12, title: 'Add cart', head: { sha: 'abc123', ref: 'feature/cart' }, base: { ref: 'main' } },
  repository: { owner: { login: 'acme' }, name: 'demo-app' },
  installation: { id: 987 },
}

describe('verifyWebhookSignature', () => {
  it('accepts a correct signature', () => {
    expect(verifyWebhookSignature(SECRET, raw, sig(raw))).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature(SECRET, Buffer.from('{"action":"closed"}'), sig(raw))).toBe(false)
  })

  it('rejects a wrong secret', () => {
    expect(verifyWebhookSignature('other-secret', raw, sig(raw))).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(verifyWebhookSignature(SECRET, raw, undefined)).toBe(false)
  })

  it('rejects a wrong-length header (no timingSafeEqual throw)', () => {
    expect(verifyWebhookSignature(SECRET, raw, 'sha256=short')).toBe(false)
  })
})

describe('isReviewablePullRequest', () => {
  it.each([
    ['opened', true],
    ['synchronize', true],
    ['reopened', true],
    ['ready_for_review', true],
    ['closed', false],
    ['edited', false],
    ['labeled', false],
  ])('action %s → %s', (action, expected) => {
    expect(isReviewablePullRequest({ ...PR, action })).toBe(expected)
  })

  it('requires the head sha, base ref, and repo identity', () => {
    expect(isReviewablePullRequest({ ...PR, pull_request: { number: 1, head: {}, base: {} } })).toBe(false)
    expect(isReviewablePullRequest({ ...PR, repository: { name: 'x' } })).toBe(false)
    expect(isReviewablePullRequest({ ...PR, pull_request: {} })).toBe(false)
  })
})

describe('reviewableFields', () => {
  it('extracts the fields the orchestration needs', () => {
    expect(reviewableFields(PR)).toEqual({
      owner: 'acme',
      repo: 'demo-app',
      number: 12,
      baseRef: 'main',
      headSha: 'abc123',
      installationId: 987,
    })
  })

  it('returns null for non-reviewable events', () => {
    expect(reviewableFields({ ...PR, action: 'closed' })).toBeNull()
  })

  it('carries null installation id when absent (fallback to env)', () => {
    const { installation: _drop, ...noInstall } = PR
    expect(reviewableFields(noInstall)?.installationId).toBeNull()
  })
})
