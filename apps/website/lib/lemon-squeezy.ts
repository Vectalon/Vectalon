/**
 * Lemon Squeezy — checkout links, webhook signature verification, event
 * parsing, and the license lifecycle handler.
 *
 * Everything is driven by env vars so the money flow activates the moment the
 * store is configured (no code changes):
 *
 *   LEMONSQUEEZY_STORE_ID             — store slug for checkout URLs
 *   LEMONSQUEEZY_WEBHOOK_SECRET       — HMAC secret for webhook verification
 *   LEMONSQUEEZY_VARIANT_<TIER>_<PRODUCT> — variant ids per tier+platform
 *     e.g. LEMONSQUEEZY_VARIANT_PRO_RN, LEMONSQUEEZY_VARIANT_ALL_ACCESS_RN,
 *          LEMONSQUEEZY_VARIANT_TEAM_RN, ..._IOS / ..._ANDROID / ..._FLUTTER
 *   RESEND_API_KEY / RESEND_FROM      — license delivery email (optional)
 *
 * The business logic (handleLemonSqueezyEvent) is pure and store-injected so
 * it is unit-testable without a running store or network.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import type { AdminStore, License, Tier } from './admin-store'

export type ProductId = 'rn' | 'ios' | 'android' | 'flutter'
export type LsTier = 'pro' | 'all-access' | 'team' | 'enterprise'

const DAY = 24 * 3600 * 1000
const INITIAL_LICENSE_DAYS = 35

/** Approximate monthly-revenue contribution per tier (US cents). */
export const TIER_MRR_CENTS: Record<LsTier, number> = {
  pro: 1900, // Individual $19/dev/mo
  'all-access': 4900, // legacy cross-SDK tier, kept for existing subscriptions
  team: 4900, // Team $49/dev/mo
  enterprise: 0,
}

/** Env-var lookup for a tier+product variant id. */
export function variantIdFor(tier: LsTier, product: ProductId = 'rn'): string | undefined {
  const key = `LEMONSQUEEZY_VARIANT_${tier.toUpperCase().replace('-', '_')}_${product.toUpperCase()}`
  const value = process.env[key]
  return value && value.trim() ? value.trim() : undefined
}

/**
 * Checkout URL for a tier+product, or null when the store isn't configured
 * yet (UI shows "Launching soon" instead of a dead link).
 */
export function checkoutUrlFor(tier: LsTier, product: ProductId = 'rn'): string | null {
  const store = process.env.LEMONSQUEEZY_STORE_ID
  const variant = variantIdFor(tier, product)
  if (!store || !variant) return null
  return `https://${store}.lemonsqueezy.com/checkout/buy/${variant}`
}

/** Reverse lookup: which tier+product owns a variant id (from env config). */
export function tierForVariantId(variantId: string): { tier: LsTier; product: ProductId } | null {
  const tiers = new Set<LsTier>(['pro', 'all-access', 'team', 'enterprise'])
  const products = new Set<ProductId>(['rn', 'ios', 'android', 'flutter'])
  for (const key of Object.keys(process.env)) {
    const m = /^LEMONSQUEEZY_VARIANT_([A-Z_]+)_([A-Z]+)$/.exec(key)
    if (m && process.env[key] === variantId) {
      const tier = m[1].toLowerCase().replace('_', '-') as LsTier
      const product = m[2].toLowerCase() as ProductId
      return tiers.has(tier) && products.has(product) ? { tier, product } : null
    }
  }
  return null
}

/** Constant-time HMAC-SHA256 signature check (Lemon Squeezy X-Signature). */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Normalized webhook event (only the fields the lifecycle handler needs). */
export interface LsWebhookEvent {
  eventId: string
  eventName: string
  attributes: Record<string, unknown>
}

export function parseWebhookEvent(body: string): LsWebhookEvent {
  const parsed = JSON.parse(body) as {
    meta?: { event_name?: string; event_id?: string }
    data?: { attributes?: Record<string, unknown> }
  }
  const eventName = parsed.meta?.event_name
  const eventId = parsed.meta?.event_id
  if (!eventName || !eventId) {
    throw new Error('malformed webhook payload: missing meta.event_name or meta.event_id')
  }
  return { eventId, eventName, attributes: parsed.data?.attributes ?? {} }
}

export interface LsHandlerResult {
  handled: boolean
  skipped?: string
  license?: License
  revoked?: number
}

/**
 * License lifecycle for Lemon Squeezy webhook events:
 *  - order_created        → mint license (lemon-squeezy source), record the
 *                           payment/customer, email the key, mark idempotent.
 *  - subscription_created / subscription_updated → keep tier/expiry in sync.
 *  - order_refunded       → instantly revoke every active license (quick
 *                           refunds) and mark the customer churned.
 *  - anything else        → acknowledged + marked idempotent, no action.
 *
 * Idempotency: a processed event id is never applied twice, so Lemon Squeezy
 * retries can't double-mint licenses.
 */
export async function handleLemonSqueezyEvent(
  event: LsWebhookEvent,
  store: AdminStore
): Promise<LsHandlerResult> {
  if (await store.hasWebhookEvent(event.eventId)) {
    return { handled: true, skipped: 'duplicate' }
  }

  const attrs = event.attributes as {
    customer_email?: string
    status?: string
    ends_at?: string | null
    renews_at?: string | null
    first_order_item?: { variant_id?: string; product_name?: string; variant_name?: string }
  }
  const email = attrs.customer_email?.trim().toLowerCase()
  const variantId = attrs.first_order_item?.variant_id
  const mapped = variantId ? tierForVariantId(variantId) : null

  switch (event.eventName) {
    case 'order_created': {
      if (!email) return { handled: false, skipped: 'no customer email' }
      if (!mapped) return { handled: false, skipped: 'manual-review: unknown variant' }
      if (mapped.product !== 'rn') return { handled: false, skipped: 'manual-review: product not available' }
      if (mapped.tier === 'team') return { handled: false, skipped: 'manual-review: trusted Team seat quantity required' }
      const tier = mapped.tier as Tier
      const product = mapped.product
      const license = await store.issueLicense({
        tier,
        email,
        product,
        seats: 1,
        days: INITIAL_LICENSE_DAYS,
        source: 'lemon-squeezy',
      })
      await store.recordPayment({
        email,
        tier,
        product,
        seats: 1,
        mrrCents: TIER_MRR_CENTS[mapped.tier],
      })
      await sendLicenseEmail({ email, license, tier, product })
      await store.markWebhookEvent(event.eventId)
      return { handled: true, license }
    }

    case 'subscription_created':
    case 'subscription_updated': {
      if (!email) return { handled: false, skipped: 'no customer email' }
      const active = attrs.status !== 'cancelled' && attrs.status !== 'expired' && attrs.status !== 'past_due'
      const expiresAt = attrs.ends_at
        ? new Date(attrs.ends_at).getTime()
        : attrs.renews_at
          ? new Date(attrs.renews_at).getTime()
          : Date.now() + INITIAL_LICENSE_DAYS * DAY
      // LS subscription payloads don't carry the variant in attributes, so
      // `mapped` is usually null here — pass the tier through only when we
      // actually mapped one, and let the store preserve the existing tier.
      const license = await store.updateLicenseForSubscription({
        email,
        tier: mapped?.tier as Tier | undefined,
        expiresAt,
        active,
      })
      if (active && license) {
        await sendLicenseEmail({ email, license, tier: license.tier, product: license.product })
      }
      await store.markWebhookEvent(event.eventId)
      return { handled: true, license: license ?? undefined }
    }

    case 'order_refunded': {
      if (!email) return { handled: false, skipped: 'no customer email' }
      const revoked = await store.revokeByEmail(email)
      await store.markWebhookEvent(event.eventId)
      return { handled: true, revoked }
    }

    default:
      // Acknowledge non-license events (license_key_*, subscription_paused,
      // test events, …) so Lemon Squeezy stops retrying, without side effects.
      await store.markWebhookEvent(event.eventId)
      return { handled: true, skipped: `unhandled: ${event.eventName}` }
  }
}

/**
 * Deliver the license key by email (Resend, fetch-based — no SDK). Skips
 * silently when RESEND_API_KEY is not configured; the key is always visible
 * in the admin portal regardless.
 */
export async function sendLicenseEmail(input: {
  email: string
  license: License
  tier: string
  product: string
}): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, skipped: true }
  const from = process.env.RESEND_FROM || 'Vectalon <licenses@vectalon.in>'
  const activate = `npx vectalon auth --license ${input.license.key}`
  const html = `
    <div style="font-family: ui-monospace, Menlo, monospace; color: #FAF6E9; line-height: 1.6">
      <p>Thanks for upgrading to Vectalon!</p>
      <p>Your license key (${input.tier} · ${input.product}):</p>
      <pre style="background:#A0522D;color:#F5F5DC;padding:14px 16px;border-radius:8px;overflow-x:auto">${input.license.key}</pre>
      <p>Activate it from anywhere inside your project:</p>
      <pre style="background:#A0522D;color:#F4A460;padding:14px 16px;border-radius:8px;overflow-x:auto">${activate}</pre>
      <p>Valid until ${new Date(input.license.expiresAt).toISOString().slice(0, 10)}.</p>
      <p style="color:#CFB98F">Questions? Reply to this email or visit vectalon.in/docs.</p>
      <p style="color:#CFB98F">— The Vectalon Team</p>
    </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: input.email, subject: 'Your Vectalon license', html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { sent: true }
    return { sent: false, error: `resend ${res.status}` }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
