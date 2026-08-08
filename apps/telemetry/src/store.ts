/**
 * Storage backends.
 *
 * - MemoryStore  — ephemeral, used when nothing else is configured (and in
 *   tests). Data resets per serverless instance.
 * - FileStore    — JSON files under DATA_DIR (default .data/). Local dev
 *   persistence + the local smoke server.
 * - UpstashStore — Vercel KV (Upstash Redis REST API) via plain fetch. Used
 *   automatically when KV_REST_API_URL + KV_REST_API_TOKEN are set, which is
 *   exactly what Vercel injects when a KV store is linked.
 *
 * All backends cap their lists (see CAPS) — telemetry is a sink, not a
 * data warehouse.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CAPS, type ErrorReport, type HeartbeatPayload, type Store, type SupportRecord } from './types'

function cap<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(arr.length - max) : arr
}

/** Shared cap/insert logic for all three backends (async storage contract). */
abstract class BaseStore implements Store {
  protected abstract readErrors(): Promise<ErrorReport[]>
  protected abstract readHeartbeats(): Promise<HeartbeatPayload[]>
  protected abstract readSupport(): Promise<SupportRecord[]>
  protected abstract writeErrors(events: ErrorReport[]): Promise<void>
  protected abstract writeHeartbeats(beats: HeartbeatPayload[]): Promise<void>
  protected abstract writeSupport(records: SupportRecord[]): Promise<void>

  async addError(event: ErrorReport): Promise<void> {
    await this.writeErrors(cap([...(await this.readErrors()), event], CAPS.errors))
  }

  async listErrors(limit = 20): Promise<ErrorReport[]> {
    return (await this.readErrors()).slice(-limit)
  }

  async recordHeartbeat(beat: HeartbeatPayload): Promise<void> {
    await this.writeHeartbeats(cap([...(await this.readHeartbeats()), beat], CAPS.heartbeats))
  }

  async listHeartbeats(limit = 20): Promise<HeartbeatPayload[]> {
    return (await this.readHeartbeats()).slice(-limit)
  }

  async saveSupport(record: SupportRecord): Promise<void> {
    await this.writeSupport(cap([...(await this.readSupport()), record], CAPS.support))
  }

  async listSupport(limit = 20): Promise<SupportRecord[]> {
    return (await this.readSupport()).slice(-limit)
  }

  async counts(): Promise<{ errors: number; heartbeats: number; support: number }> {
    return {
      errors: (await this.readErrors()).length,
      heartbeats: (await this.readHeartbeats()).length,
      support: (await this.readSupport()).length,
    }
  }
}

export class MemoryStore extends BaseStore {
  private errors: ErrorReport[] = []
  private heartbeats: HeartbeatPayload[] = []
  private support: SupportRecord[] = []

  protected async readErrors(): Promise<ErrorReport[]> {
    return this.errors
  }
  protected async readHeartbeats(): Promise<HeartbeatPayload[]> {
    return this.heartbeats
  }
  protected async readSupport(): Promise<SupportRecord[]> {
    return this.support
  }
  protected async writeErrors(events: ErrorReport[]): Promise<void> {
    this.errors = events
  }
  protected async writeHeartbeats(beats: HeartbeatPayload[]): Promise<void> {
    this.heartbeats = beats
  }
  protected async writeSupport(records: SupportRecord[]): Promise<void> {
    this.support = records
  }
}

export class FileStore extends BaseStore {
  constructor(private readonly dir: string) {
    super()
  }

  private file(name: string): string {
    return join(this.dir, name)
  }

  private read<T>(name: string): T[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file(name), 'utf-8'))
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }

  private write(name: string, value: unknown[]): void {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.file(name), JSON.stringify(value))
  }

  protected async readErrors(): Promise<ErrorReport[]> {
    return this.read<ErrorReport>('errors.json')
  }
  protected async readHeartbeats(): Promise<HeartbeatPayload[]> {
    return this.read<HeartbeatPayload>('heartbeats.json')
  }
  protected async readSupport(): Promise<SupportRecord[]> {
    return this.read<SupportRecord>('support.json')
  }
  protected async writeErrors(events: ErrorReport[]): Promise<void> {
    this.write('errors.json', events)
  }
  protected async writeHeartbeats(beats: HeartbeatPayload[]): Promise<void> {
    this.write('heartbeats.json', beats)
  }
  protected async writeSupport(records: SupportRecord[]): Promise<void> {
    this.write('support.json', records)
  }
}

/**
 * Vercel KV / Upstash Redis via its REST API — zero SDK dependency. Lists are
 * stored as a JSON array under one key per collection with a 30-day TTL.
 */
export class UpstashStore extends BaseStore {
  constructor(
    private readonly url: string,
    private readonly token: string
  ) {
    super()
  }

  private async post(commands: unknown[][]): Promise<unknown[]> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Upstash ${res.status} ${await res.text().catch(() => '')}`.trim())
    const data = (await res.json()) as { result?: unknown[] }
    return Array.isArray(data.result) ? data.result : []
  }

  private async getRaw(key: string): Promise<string | null> {
    const res = await fetch(`${this.url}/get/${key}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { result?: string | null }
    return data.result ?? null
  }

  private async readList<T>(key: string): Promise<T[]> {
    const raw = await this.getRaw(key)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }

  private async writeList(key: string, value: unknown[]): Promise<void> {
    // SET with 30-day TTL so stale collections expire on their own.
    await this.post([['set', key, JSON.stringify(value), 'EX', 30 * 24 * 3600]])
  }

  protected async readErrors(): Promise<ErrorReport[]> {
    return this.readList<ErrorReport>('vectalon:errors')
  }
  protected async readHeartbeats(): Promise<HeartbeatPayload[]> {
    return this.readList<HeartbeatPayload>('vectalon:heartbeats')
  }
  protected async readSupport(): Promise<SupportRecord[]> {
    return this.readList<SupportRecord>('vectalon:support')
  }
  protected async writeErrors(events: ErrorReport[]): Promise<void> {
    await this.writeList('vectalon:errors', events)
  }
  protected async writeHeartbeats(beats: HeartbeatPayload[]): Promise<void> {
    await this.writeList('vectalon:heartbeats', beats)
  }
  protected async writeSupport(records: SupportRecord[]): Promise<void> {
    await this.writeList('vectalon:support', records)
  }
}

/** Pick the store from the environment: Vercel KV > file (dev) > memory. */
export function defaultStore(): Store {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return new UpstashStore(process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN)
  }
  if (process.env.NODE_ENV !== 'production' || process.env.DATA_DIR) {
    return new FileStore(process.env.DATA_DIR || '.data')
  }
  return new MemoryStore()
}
