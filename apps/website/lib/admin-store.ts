/**
 * Admin data store — licenses, trials, customers, revenue, feature usage.
 *
 * Backed by a JSON file (DATA_DIR, default .data/) so the dashboard works
 * locally in dev and on a single-instance host with a writable volume.
 *
 * NOTE: on Vercel serverless, /tmp is ephemeral and per-instance — the
 * registry resets on cold start and concurrent instances race on the
 * read-modify-write. For the real launch, swap this for a shared store
 * (Supabase/Postgres per the monetization plan); the API contract is
 * unaffected.
 *
 * When no file is present, a realistic demo dataset is seeded so the
 * dashboard is never empty.
 *
 * This mirrors the telemetry app's store pattern (apps/telemetry/src/store.ts)
 * and is deliberately dependency-free.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes, createHash } from 'crypto'

export type Tier = 'free' | 'pro' | 'team' | 'enterprise'
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
  }
}

export class AdminStore {
  constructor(private readonly dir: string) {}

  private file(): string {
    return join(this.dir, 'admin.json')
  }

  private read(): AdminData {
    try {
      if (existsSync(this.file())) {
        const parsed = JSON.parse(readFileSync(this.file(), 'utf-8')) as AdminData
        if (parsed && Array.isArray(parsed.licenses)) return parsed
      }
    } catch {
      // fall through to seed
    }
    const demo = seededDemo()
    this.write(demo)
    return demo
  }

  private write(data: AdminData): void {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.file(), JSON.stringify(data, null, 2))
  }

  async getData(): Promise<AdminData> {
    return this.read()
  }

  async stats(): Promise<AdminStats> {
    const data = this.read()
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
  }): Promise<License> {
    const data = this.read()
    const license: License = {
      key: `vct_${createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 32)}`,
      tier: input.tier,
      product: 'rn',
      email: input.email,
      githubUsername: input.githubUsername,
      status: 'active',
      issuedAt: Date.now(),
      expiresAt: daysFromNow(input.days ?? 365),
      seats: input.seats ?? 1,
      source: 'manual',
    }
    data.licenses.unshift(license)
    this.write(data)
    return license
  }

  async revokeLicense(key: string): Promise<boolean> {
    const data = this.read()
    const found = data.licenses.find(l => l.key === key)
    if (!found) return false
    found.status = 'revoked'
    this.write(data)
    return true
  }

  async validateLicense(key: string): Promise<{ valid: boolean; license?: License; reason?: string }> {
    const data = this.read()
    const license = data.licenses.find(l => l.key === key)
    if (!license) return { valid: false, reason: 'license not found' }
    if (license.status === 'revoked') return { valid: false, reason: 'license revoked' }
    if (license.expiresAt < Date.now()) return { valid: false, reason: 'license expired' }
    if (license.status === 'pending') return { valid: false, reason: 'license not activated' }
    return { valid: true, license }
  }

  async registerTrial(input: { githubUserId: string; githubUsername: string; tier?: Tier }): Promise<{ started: boolean; trial?: Trial; reason?: string }> {
    const data = this.read()
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
    this.write(data)
    return { started: true, trial }
  }

  async checkTrial(githubUserId: string): Promise<{ used: boolean; trial?: Trial }> {
    const data = this.read()
    const trial = data.trials.find(t => t.githubUserId === githubUserId)
    return { used: !!trial, trial }
  }
}

/** Store dir: env override (Vercel writable dir) or ./.data */
export function defaultAdminStore(): AdminStore {
  return new AdminStore(process.env.DATA_DIR || join(process.cwd(), '.data'))
}

export function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
