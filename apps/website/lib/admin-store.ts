/**
 * Admin data store — licenses, trials, customers, revenue, feature usage,
 * webhook idempotency, and SDK waitlist signups.
 *
 * Storage is pluggable:
 *  - PostgresPersistence (DATABASE_URL) — the live store for Vercel serverless.
 *    The whole document lives in one JSONB row (id=1) so every lambda instance
 *    sees the same data and the existing read-modify-write API is unchanged.
 *  - FilePersistence (DATA_DIR, default ./.data) — local dev + the smoke server.
 *
 * Demo data seeds ONLY in development (or when VECTALON_SEED_DEMO=1), so a
 * production dashboard is never polluted with fake customers. "Live data" comes
 * from the Lemon Squeezy webhook, /v1/trial, /v1/validate usage events, and the
 * SDK waitlist form.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes, createHash } from 'crypto'
import { Pool } from 'pg'
import { validateExplicitCapabilityGrants } from './capability-availability'

export type Tier = 'free' | 'pro' | 'all-access' | 'team' | 'enterprise'
export type LicenseStatus = 'active' | 'revoked' | 'expired' | 'pending'

export interface License {
  key: string
  tier: Tier
  product: string
  email: string
  githubUsername?: string
  status: LicenseStatus
  issuedAt: number
  expiresAt: number
  seats: number
  source: 'lemon-squeezy' | 'manual' | 'trial-conversion' | 'demo'
  capabilities?: string[]
}

export interface Trial {
  githubUserId: string
  githubUsername: string
  tier: Tier
  startedAt: number
  expiresAt: number
  deviceFingerprint?: string
  converted: boolean
}

export interface Customer {
  id: string
  email: string
  name?: string
  githubUsername?: string
  tier: Tier
  seats: number
  mrrCents: number
  joinedAt: number
  lastActiveAt: number
  status: 'active' | 'trialing' | 'churned'
}

export interface FeatureEvent {
  feature: string
  count: number
  date: string
}

export interface AdminData {
  licenses: License[]
  trials: Trial[]
  customers: Customer[]
  featureUsage: FeatureEvent[]
  revenueByMonth: Array<{ month: string; mrrCents: number; arrCents: number }>
  /** Lemon Squeezy webhook event ids already processed (idempotency). */
  processedWebhookEvents: string[]
  /** SDK waitlist signups — { email, product, at } appended in order. */
  waitlist: Array<{ email: string; product: string; at: number }>
}

export interface AdminStats {
  mrrCents: number
  arrCents: number
  activeLicenses: number
  revokedLicenses: number
  trialCount: number
  trialConversionRate: number
  activeCustomers: number
  churnedCustomers: number
  topFeatures: Array<{ feature: string; count: number }>
}

const DAY = 24 * 3600 * 1000

function daysFromNow(days: number): number {
  return Date.now() + days * DAY
}

/** Empty production document — no demo rows ever. */
function emptyData(): AdminData {
  return {
    licenses: [],
    trials: [],
    customers: [],
    featureUsage: [],
    revenueByMonth: [],
    processedWebhookEvents: [],
    waitlist: [],
  }
}

/** Demo data seeds only in local development (or explicitly via env). */
function shouldSeedDemo(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.VECTALON_SEED_DEMO === '1'
}

function seededDemo(): AdminData {
  const now = Date.now()
  const mkLicense = (
    tier: Tier,
    email: string,
    status: LicenseStatus,
    daysToExpiry: number,
    seats = 1
  ): License => ({
    key: `vct_${randomBytes(12).toString('hex')}`,
    tier,
    product: 'rn',
    email,
    status,
    issuedAt: now - 60 * DAY,
    expiresAt: daysFromNow(daysToExpiry),
    seats,
    source: 'demo',
  })

  return {
    licenses: [
      mkLicense('free', 'ada@startup.dev', 'active', 9999),
      mkLicense('pro', 'priya@builders.io', 'active', 300),
      mkLicense('pro', 'marco@indiehacker.dev', 'active', 250),
      mkLicense('team', 'cto@acme-corp.com', 'active', 340, 12),
      mkLicense('team', 'eng@northwind.xyz', 'active', 180, 8),
      mkLicense('enterprise', 'licensing@bigbank.com', 'active', 400, 120),
      mkLicense('pro', 'churned@oldco.com', 'expired', -30),
      mkLicense('pro', 'leaked@cracked.dev', 'revoked', 200),
    ],
    trials: [
      { githubUserId: '1', githubUsername: 'ada', tier: 'pro', startedAt: now - 3 * DAY, expiresAt: now + 11 * DAY, converted: false },
      { githubUserId: '2', githubUsername: 'priya', tier: 'pro', startedAt: now - 20 * DAY, expiresAt: now - 6 * DAY, converted: true },
      { githubUserId: '3', githubUsername: 'marco', tier: 'pro', startedAt: now - 5 * DAY, expiresAt: now + 9 * DAY, converted: false },
      { githubUserId: '4', githubUsername: 'ken', tier: 'pro', startedAt: now - 40 * DAY, expiresAt: now - 26 * DAY, converted: false },
      { githubUserId: '5', githubUsername: 'yuki', tier: 'pro', startedAt: now - 2 * DAY, expiresAt: now + 12 * DAY, converted: false },
    ],
    customers: [
      { id: 'c1', email: 'priya@builders.io', name: 'Priya', tier: 'pro', seats: 1, mrrCents: 1900, joinedAt: now - 45 * DAY, lastActiveAt: now - 1 * DAY, status: 'active' },
      { id: 'c2', email: 'cto@acme-corp.com', name: 'Acme Corp', tier: 'team', seats: 12, mrrCents: 118800, joinedAt: now - 100 * DAY, lastActiveAt: now - 2 * DAY, status: 'active' },
      { id: 'c3', email: 'marco@indiehacker.dev', name: 'Marco', tier: 'pro', seats: 1, mrrCents: 1900, joinedAt: now - 12 * DAY, lastActiveAt: now - 5 * DAY, status: 'active' },
      { id: 'c4', email: 'churned@oldco.com', name: 'Oldco', tier: 'pro', seats: 1, mrrCents: 1900, joinedAt: now - 200 * DAY, lastActiveAt: now - 40 * DAY, status: 'churned' },
    ],
    featureUsage: [
      { feature: 'upgrade', count: 1240, date: 'all' },
      { feature: 'feature', count: 3320, date: 'all' },
      { feature: 'serve', count: 4150, date: 'all' },
      { feature: 'doctor', count: 2880, date: 'all' },
      { feature: 'bundle', count: 940, date: 'all' },
      { feature: 'sync', count: 310, date: 'all' },
      { feature: 'ci', count: 620, date: 'all' },
    ],
    revenueByMonth: [
      { month: '2026-03', mrrCents: 0, arrCents: 0 },
      { month: '2026-04', mrrCents: 1900, arrCents: 22800 },
      { month: '2026-05', mrrCents: 5700, arrCents: 68400 },
      { month: '2026-06', mrrCents: 9500, arrCents: 114000 },
      { month: '2026-07', mrrCents: 19000, arrCents: 228000 },
      { month: '2026-08', mrrCents: 122500, arrCents: 1470000 },
    ],
    processedWebhookEvents: [],
    waitlist: [],
  }
}

/** Persistence contract: load a document or null, save a document. */
export interface Persistence {
  load(): Promise<AdminData | null>
  save(data: AdminData): Promise<void>
}

/** JSON file backend — local dev and single-instance hosts. */
export class FilePersistence implements Persistence {
  constructor(private readonly dir: string) {}

  private file(): string {
    return join(this.dir, 'admin.json')
  }

  async load(): Promise<AdminData | null> {
    try {
      if (existsSync(this.file())) {
        const parsed = JSON.parse(readFileSync(this.file(), 'utf-8')) as AdminData
        if (parsed && Array.isArray(parsed.licenses)) return parsed
      }
    } catch {
      // fall through to null → caller seeds/empties
    }
    return null
  }

  async save(data: AdminData): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.file(), JSON.stringify(data, null, 2))
  }
}

/**
 * Postgres backend — the live store for Vercel serverless. The whole document
 * lives in one JSONB row (id=1): every instance reads/writes the same row, so
 * the AdminStore read-modify-write API is unchanged and no migrations beyond
 * the CREATE TABLE IF NOT EXISTS are needed at this scale.
 */
export class PostgresPersistence implements Persistence {
  private readonly pool: Pool
  private readonly ready: Promise<unknown>

  constructor(url: string) {
    const useSsl = !/localhost|127\.0\.0\.1/.test(url)
    this.pool = new Pool({
      connectionString: url,
      max: 2,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    })
    this.ready = this.pool.query(
      `CREATE TABLE IF NOT EXISTS admin_state (
         id SMALLINT PRIMARY KEY,
         data JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    )
  }

  async load(): Promise<AdminData | null> {
    await this.ready
    const { rows } = await this.pool.query<{ data: AdminData }>(
      'SELECT data FROM admin_state WHERE id = 1'
    )
    return rows[0]?.data ?? null
  }

  async save(data: AdminData): Promise<void> {
    await this.ready
    await this.pool.query(
      `INSERT INTO admin_state (id, data, updated_at) VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(data)]
    )
  }
}

export class AdminStore {
  constructor(private readonly persistence: Persistence) {}

  private async read(): Promise<AdminData> {
    const loaded = await this.persistence.load()
    if (loaded) {
      // Migrate documents written before these fields existed — a missing
      // array here would throw in hasWebhookEvent/addWaitlist and take down
      // the webhook + admin paths for existing installs.
      if (!Array.isArray(loaded.processedWebhookEvents)) loaded.processedWebhookEvents = []
      if (!Array.isArray(loaded.waitlist)) loaded.waitlist = []
      return loaded
    }
    const initial = shouldSeedDemo() ? seededDemo() : emptyData()
    await this.persistence.save(initial)
    return initial
  }

  private async write(data: AdminData): Promise<void> {
    await this.persistence.save(data)
  }

  async getData(): Promise<AdminData> {
    return this.read()
  }

  async stats(): Promise<AdminStats> {
    const data = await this.read()
    const mrrCents = data.customers.filter(c => c.status === 'active').reduce((s, c) => s + c.mrrCents, 0)
    const activeLicenses = data.licenses.filter(l => l.status === 'active').length
    const revokedLicenses = data.licenses.filter(l => l.status === 'revoked').length
    const convertedTrials = data.trials.filter(t => t.converted).length
    return {
      mrrCents,
      arrCents: mrrCents * 12,
      activeLicenses,
      revokedLicenses,
      trialCount: data.trials.length,
      trialConversionRate: data.trials.length ? Math.round((convertedTrials / data.trials.length) * 100) : 0,
      activeCustomers: data.customers.filter(c => c.status === 'active').length,
      churnedCustomers: data.customers.filter(c => c.status === 'churned').length,
      topFeatures: [...data.featureUsage].sort((a, b) => b.count - a.count).slice(0, 5),
    }
  }

  async issueLicense(input: {
    tier: Tier
    email: string
    githubUsername?: string
    seats?: number
    days?: number
    product?: string
    source?: License['source']
    capabilityIds?: string[]
    experimentalOptIn?: boolean
  }): Promise<License> {
    const product = input.product ?? 'rn'
    if (product !== 'rn') throw new Error('product-not-available-for-new-grants')
    if (input.tier === 'team' && (!Number.isSafeInteger(input.seats) || (input.seats ?? 0) < 2)) {
      throw new Error('Team requires a trusted purchased seat quantity')
    }
    const capabilities = input.capabilityIds?.length
      ? validateExplicitCapabilityGrants({
          tier: input.tier,
          product,
          capabilityIds: input.capabilityIds,
          experimentalOptIn: input.experimentalOptIn,
        })
      : undefined
    const data = await this.read()
    const license: License = {
      key: `vct_${createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 32)}`,
      tier: input.tier,
      product,
      email: input.email,
      githubUsername: input.githubUsername,
      status: 'active',
      issuedAt: Date.now(),
      expiresAt: daysFromNow(input.days ?? 365),
      seats: input.seats ?? 1,
      source: input.source ?? 'manual',
      capabilities,
    }
    data.licenses.unshift(license)
    await this.write(data)
    return license
  }

  async revokeLicense(key: string): Promise<boolean> {
    const data = await this.read()
    const found = data.licenses.find(l => l.key === key)
    if (!found) return false
    found.status = 'revoked'
    await this.write(data)
    return true
  }

  /** Revoke every active license for an email (refunds) and mark churned. */
  async revokeByEmail(email: string): Promise<number> {
    const data = await this.read()
    let n = 0
    for (const l of data.licenses) {
      if (l.email === email && l.status === 'active') {
        l.status = 'revoked'
        n++
      }
    }
    const customer = data.customers.find(c => c.email === email)
    if (customer) {
      customer.status = 'churned'
      customer.lastActiveAt = Date.now()
    }
    if (n || customer) await this.write(data)
    return n
  }

  async licensesForEmail(email: string): Promise<License[]> {
    const data = await this.read()
    return data.licenses.filter(l => l.email === email)
  }

  /**
   * Keep a subscription's license in sync (expiry/status, tier when mapped).
   * Tier is optional: subscription webhook payloads often don't carry the
   * variant, and blindly defaulting to 'pro' would downgrade an all-access or
   * team subscriber. When omitted, the existing tier is preserved.
   */
  async updateLicenseForSubscription(input: {
    email: string
    tier?: Tier
    expiresAt: number
    active: boolean
  }): Promise<boolean> {
    const data = await this.read()
    const license = data.licenses.find(l => l.email === input.email && l.status !== 'revoked')
    if (!license) return false
    if (input.tier) license.tier = input.tier
    license.expiresAt = input.expiresAt
    license.status = input.active ? 'active' : 'expired'
    await this.write(data)
    return true
  }

  async validateLicense(key: string): Promise<{ valid: boolean; license?: License; reason?: string }> {
    const data = await this.read()
    const license = data.licenses.find(l => l.key === key)
    if (!license) return { valid: false, reason: 'license not found' }
    if (license.status === 'revoked') return { valid: false, reason: 'license revoked' }
    if (license.expiresAt < Date.now()) return { valid: false, reason: 'license expired' }
    if (license.status === 'pending') return { valid: false, reason: 'license not activated' }
    return { valid: true, license }
  }

  async registerTrial(input: { githubUserId: string; githubUsername: string; tier?: Tier }): Promise<{ started: boolean; trial?: Trial; reason?: string }> {
    const data = await this.read()
    const existing = data.trials.find(t => t.githubUserId === input.githubUserId)
    if (existing) return { started: false, reason: 'trial already used for this GitHub account' }
    const trial: Trial = {
      githubUserId: input.githubUserId,
      githubUsername: input.githubUsername,
      tier: input.tier ?? 'pro',
      startedAt: Date.now(),
      expiresAt: daysFromNow(14),
      converted: false,
    }
    data.trials.push(trial)
    await this.write(data)
    return { started: true, trial }
  }

  async checkTrial(githubUserId: string): Promise<{ used: boolean; trial?: Trial }> {
    const data = await this.read()
    const trial = data.trials.find(t => t.githubUserId === githubUserId)
    return { used: !!trial, trial }
  }

  /** Webhook idempotency — true when this event id was already processed. */
  async hasWebhookEvent(id: string): Promise<boolean> {
    const data = await this.read()
    return data.processedWebhookEvents.includes(id)
  }

  async markWebhookEvent(id: string): Promise<void> {
    const data = await this.read()
    if (!data.processedWebhookEvents.includes(id)) {
      data.processedWebhookEvents.push(id)
      data.processedWebhookEvents = data.processedWebhookEvents.slice(-500)
      await this.write(data)
    }
  }

  /** Upsert a paying customer and recompute the current month's MRR/ARR. */
  async recordPayment(input: { email: string; tier: Tier; mrrCents: number; seats?: number; product?: string }): Promise<void> {
    const data = await this.read()
    const existing = data.customers.find(c => c.email === input.email)
    if (existing) {
      existing.tier = input.tier
      existing.mrrCents = input.mrrCents
      existing.seats = input.seats ?? existing.seats
      existing.status = 'active'
      existing.lastActiveAt = Date.now()
    } else {
      data.customers.unshift({
        id: `c_${randomBytes(6).toString('hex')}`,
        email: input.email,
        tier: input.tier,
        seats: input.seats ?? 1,
        mrrCents: input.mrrCents,
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
        status: 'active',
      })
    }
    const month = new Date().toISOString().slice(0, 7)
    const totalMrr = data.customers.filter(c => c.status === 'active').reduce((s, c) => s + c.mrrCents, 0)
    const row = data.revenueByMonth.find(r => r.month === month)
    if (row) {
      row.mrrCents = totalMrr
      row.arrCents = totalMrr * 12
    } else {
      data.revenueByMonth.push({ month, mrrCents: totalMrr, arrCents: totalMrr * 12 })
      data.revenueByMonth.sort((a, b) => a.month.localeCompare(b.month))
    }
    await this.write(data)
  }

  /** Feature usage events (e.g. online license checks from /v1/validate). */
  async recordUsage(feature: string, count = 1): Promise<void> {
    const data = await this.read()
    const row = data.featureUsage.find(f => f.feature === feature && f.date === 'all')
    if (row) row.count += count
    else data.featureUsage.push({ feature, count, date: 'all' })
    await this.write(data)
  }

  /** SDK waitlist signup (deduped per email+product). */
  async addWaitlist(email: string, product: string): Promise<boolean> {
    const data = await this.read()
    if (data.waitlist.some(w => w.email === email && w.product === product)) return false
    data.waitlist.push({ email, product, at: Date.now() })
    await this.write(data)
    return true
  }
}

/** Store dir: env override (Vercel writable dir) or ./.data */
export function defaultAdminStore(): AdminStore {
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl) return new AdminStore(new PostgresPersistence(dbUrl))
  return new AdminStore(new FilePersistence(process.env.DATA_DIR || join(process.cwd(), '.data')))
}

export function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
