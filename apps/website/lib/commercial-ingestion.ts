import 'server-only'
import { createHash, createHmac } from 'node:crypto'
import { Pool } from 'pg'
import { applyCommercialEvent, initialCommercialState } from '@vectalon-dev/core'
import type { LsWebhookEvent } from './lemon-squeezy'
import { verifyCheckoutAttribution, type CheckoutAttribution } from './commercial-checkout'

const EVENT_TYPES: Record<string, string> = {
  order_created: 'subscription_started', order_refunded: 'order_refunded', subscription_created: 'subscription_started', subscription_updated: 'subscription_updated', subscription_payment_success: 'subscription_renewed', subscription_payment_failed: 'payment_failed', subscription_paused: 'subscription_paused', subscription_resumed: 'subscription_resumed', subscription_cancelled: 'subscription_canceled', subscription_expired: 'subscription_expired', subscription_unpaused: 'subscription_resumed', subscription_payment_recovered: 'payment_recovered', order_disputed: 'payment_disputed',
}

export interface NormalizedProviderEvent { provider: 'lemon-squeezy'; providerEventId: string; providerSequence: number; eventType: string; subscriptionId: string; customerId: string; occurredAt: string; sourceDigest: string; normalized: Record<string, unknown> }

export function normalizeLemonEvent(event: LsWebhookEvent, rawBody: string, secret: string): NormalizedProviderEvent {
  const attrs = event.attributes as Record<string, unknown>
  const occurredAt = timestamp(attrs.updated_at ?? attrs.created_at)
  const resourceId = event.resourceId || text(attrs.order_id) || text(attrs.subscription_id)
  const subscriptionId = text(attrs.order_id) || text(attrs.subscription_id) || resourceId
  const customerId = text(attrs.customer_id) || emailSubject(attrs.customer_email, secret)
  if (!subscriptionId || !customerId) throw new Error('commercial-event-identity-missing')
  const normalized = {
    eventType: normalizedEventType(event.eventName, attrs.status), subscriptionId, customerId,
    status: text(attrs.status), periodEndsAt: text(attrs.ends_at) || text(attrs.renews_at),
    variantId: text((attrs.first_order_item as Record<string, unknown> | undefined)?.variant_id),
    seatQuantity: Number((attrs.first_order_item as Record<string, unknown> | undefined)?.quantity) || null,
    amountMinor: integer(attrs.total), taxMinor: integer(attrs.tax), discountMinor: integer(attrs.discount_total), refundMinor: integer(attrs.refunded_amount),
    attribution: event.customData ?? null,
  }
  return Object.freeze({ provider: 'lemon-squeezy', providerEventId: event.eventId, providerSequence: new Date(occurredAt).getTime(), eventType: normalized.eventType, subscriptionId, customerId, occurredAt, sourceDigest: createHash('sha256').update(rawBody).digest('hex'), normalized: Object.freeze(normalized) })
}

export async function persistCommercialEvent(input: NormalizedProviderEvent, databaseUrl = process.env.DATABASE_URL): Promise<'appended' | 'duplicate'> {
  if (!databaseUrl) throw new Error('commercial-database-unavailable')
  const pool = new Pool({ connectionString: databaseUrl, max: 1, ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: true } })
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [input.subscriptionId])
    const inserted = await client.query(`insert into vectalon_private.provider_events (provider, provider_event_id, provider_sequence, event_type, subscription_id, customer_id, occurred_at, source_digest, normalized_event) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) on conflict (provider, provider_event_id) do nothing returning id`, [input.provider, input.providerEventId, input.providerSequence, input.eventType, input.subscriptionId, input.customerId, input.occurredAt, input.sourceDigest, JSON.stringify(input.normalized)])
    if (!inserted.rowCount) {
      const prior = await client.query<{ source_digest: string }>('select source_digest from vectalon_private.provider_events where provider=$1 and provider_event_id=$2', [input.provider, input.providerEventId])
      if (prior.rows[0]?.source_digest !== input.sourceDigest) throw new Error('commercial-event-conflict')
    }
    const rows = await client.query<{ provider: 'lemon-squeezy'; provider_event_id: string; provider_sequence: string; occurred_at: Date; source_digest: string; normalized_event: Record<string, unknown> }>('select provider, provider_event_id, provider_sequence, occurred_at, source_digest, normalized_event from vectalon_private.provider_events where subscription_id=$1 order by provider_sequence, occurred_at, id', [input.subscriptionId])
    const normalizedRows = rows.rows.map(row => ({ provider: row.provider, providerEventId: row.provider_event_id, providerSequence: Number(row.provider_sequence), eventType: String(row.normalized_event.eventType), subscriptionId: String(row.normalized_event.subscriptionId), customerId: String(row.normalized_event.customerId), occurredAt: row.occurred_at.toISOString(), sourceDigest: row.source_digest, normalized: row.normalized_event }))
    const projection = projectNormalizedLedger(normalizedRows)
    const latest = normalizedRows[normalizedRows.length - 1]
    await client.query(`insert into vectalon_private.subscription_projections (subscription_id, customer_id, state, projection, last_provider_sequence, last_event_id, reconciled_at) values ($1,$2,$3,$4::jsonb,$5,(select id from vectalon_private.provider_events where provider=$6 and provider_event_id=$7),$8) on conflict (subscription_id) do update set customer_id=excluded.customer_id,state=excluded.state,projection=excluded.projection,last_provider_sequence=excluded.last_provider_sequence,last_event_id=excluded.last_event_id,reconciled_at=excluded.reconciled_at,updated_at=clock_timestamp()`, [input.subscriptionId, 'customerId' in projection ? projection.customerId : input.customerId, projection.status, JSON.stringify(projection), latest.providerSequence, latest.provider, latest.providerEventId, projection.status === 'pending-review' ? null : new Date()])
    await client.query('commit')
    return inserted.rowCount ? 'appended' : 'duplicate'
  } catch (error) { await client.query('rollback'); throw error } finally { client.release(); await pool.end() }
}

export function projectNormalizedLedger(events: readonly NormalizedProviderEvent[]) {
  if (!events.length) throw new Error('commercial-ledger-empty')
  const subscriptionId = events[0].subscriptionId
  const ordered = [...events].sort((left, right) => left.providerSequence - right.providerSequence || left.providerEventId.localeCompare(right.providerEventId))
  const attributed = ordered.map(event => attribution(event.normalized.attribution)).find((value): value is CheckoutAttribution => value !== null)
  if (!attributed) return { subscriptionId, status: 'pending-review', reason: 'checkout-attribution-missing' }
  let state = initialCommercialState(subscriptionId)
  for (const event of ordered) {
    const period = Date.parse(String(event.normalized.periodEndsAt || event.occurredAt))
    state = applyCommercialEvent(state, { id: event.providerEventId, provider: event.provider, providerSequence: event.providerSequence, occurredAt: Date.parse(event.occurredAt), type: event.eventType as Parameters<typeof applyCommercialEvent>[1]['type'], subscriptionId, customerId: event.customerId, offer: { catalogVersion: attributed.catalogVersion, planId: attributed.planId, productScope: attributed.productScope, tier: attributed.tier, seats: attributed.seats }, periodEndsAt: Number.isFinite(period) ? period : Date.parse(event.occurredAt), graceEndsAt: event.eventType === 'payment_failed' ? Date.parse(event.occurredAt) + 7 * 86_400_000 : undefined, currency: 'USD', amountMinor: integer(event.normalized.amountMinor) })
  }
  return state
}

function timestamp(value: unknown): string { const parsed = typeof value === 'string' ? new Date(value) : new Date(); if (Number.isNaN(parsed.getTime())) throw new Error('commercial-event-time-invalid'); return parsed.toISOString() }
function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '' }
function emailSubject(value: unknown, secret: string): string { const email = text(value).toLowerCase(); return email ? `email:${createHmac('sha256', secret).update(email).digest('hex')}` : '' }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0 }
function normalizedEventType(name: string, status: unknown): string { const value = text(status); if (name === 'subscription_updated') { if (value === 'cancelled' || value === 'canceled') return 'subscription_canceled'; if (value === 'expired') return 'subscription_expired'; if (value === 'paused') return 'subscription_paused'; if (value === 'past_due') return 'payment_failed' } return EVENT_TYPES[name] ?? 'unknown' }
function attribution(value: unknown): CheckoutAttribution | null { if (!value || typeof value !== 'object') return null; const data = value as Record<string, unknown>; const candidate = { correlationId: text(data.correlation_id), catalogVersion: text(data.catalog_version), planId: text(data.plan_id), productScope: text(data.product_scope).split(',').filter(Boolean), tier: text(data.tier), seats: integer(data.seats), signature: text(data.attribution_signature) } as CheckoutAttribution; return verifyCheckoutAttribution(candidate) }
