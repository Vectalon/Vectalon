/**
 * UsageReporter — Anonymous, opt-in telemetry
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { TelemetryEvent, TelemetryBatch } from './types'

const CONFIG_DIR = join(homedir(), '.config', 'vectalon')
const TELEMETRY_FILE = join(CONFIG_DIR, 'telemetry.json')
const BATCH_SIZE = 50
const API_ENDPOINT = 'https://api.vectalon.in/v1/telemetry'

export class UsageReporter {
  private enabled: boolean

  constructor() {
    this.enabled = this.readEnabled()
  }

  static isEnabled(): boolean {
    try {
      if (existsSync(TELEMETRY_FILE)) {
        const config = JSON.parse(readFileSync(TELEMETRY_FILE, 'utf-8'))
        return config.enabled === true
      }
    } catch {
      // Default to disabled
    }
    return false
  }

  static enable(): void {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(TELEMETRY_FILE, JSON.stringify({ enabled: true, optedInAt: Date.now() }, null, 2))
  }

  static disable(): void {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(TELEMETRY_FILE, JSON.stringify({ enabled: false, optedOutAt: Date.now() }, null, 2))
  }

  track(event: string, product: string, feature?: string, metadata?: Record<string, unknown>): void {
    if (!this.enabled) return

    const telemetryEvent: TelemetryEvent = {
      event,
      product,
      feature,
      tier: 'unknown', // Will be enriched server-side
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
      deviceId: this.getDeviceId(),
      metadata,
    }

    this.enqueue(telemetryEvent)
  }

  async flush(): Promise<void> {
    if (!this.enabled) return

    const batch = this.readQueue()
    if (batch.events.length === 0) return

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      })

      if (response.ok) {
        this.clearQueue()
      }
    } catch {
      // Silently fail — telemetry should never break the tool
    }
  }

  private readEnabled(): boolean {
    return UsageReporter.isEnabled()
  }

  private enqueue(event: TelemetryEvent): void {
    const queue = this.readQueue()
    queue.events.push(event)

    if (queue.events.length >= BATCH_SIZE) {
      this.flush()
    } else {
      this.writeQueue(queue)
    }
  }

  private readQueue(): TelemetryBatch {
    try {
      const queueFile = join(CONFIG_DIR, 'telemetry-queue.json')
      if (existsSync(queueFile)) {
        return JSON.parse(readFileSync(queueFile, 'utf-8'))
      }
    } catch {
      // Empty queue
    }
    return { events: [] }
  }

  private writeQueue(batch: TelemetryBatch): void {
    const queueFile = join(CONFIG_DIR, 'telemetry-queue.json')
    writeFileSync(queueFile, JSON.stringify(batch, null, 2))
  }

  private clearQueue(): void {
    const queueFile = join(CONFIG_DIR, 'telemetry-queue.json')
    writeFileSync(queueFile, JSON.stringify({ events: [] }, null, 2))
  }

  private getSessionId(): string {
    // Simple session ID based on process start time
    return `${process.pid}-${Math.floor(Date.now() / 1000 / 60 / 60)}`
  }

  private getDeviceId(): string {
    const { hostname, username } = require('os')
    const data = `${hostname()}-${username()}-${process.platform}`
    return require('crypto').createHash('sha256').update(data).digest('hex').slice(0, 16)
  }
}
