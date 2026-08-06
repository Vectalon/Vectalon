/**
 * VectalonConfig — Shared configuration store
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { DEFAULTS } from './types'
import type { ConfigOptions } from './types'

const CONFIG_DIR = join(homedir(), '.config', 'vectalon')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

let cache: Record<string, unknown> | null = null

export class VectalonConfig {
  static load(): Record<string, unknown> {
    if (cache) return cache
    try {
      if (existsSync(CONFIG_FILE)) {
        cache = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
      }
    } catch {
      // Corrupted or missing config
    }
    cache = cache || {}
    return cache
  }

  static save(): void {
    if (cache) {
      mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(CONFIG_FILE, JSON.stringify(cache, null, 2))
    }
  }

  static get(key: string): unknown {
    const data = this.load()
    return key in data ? data[key] : DEFAULTS[key as keyof ConfigOptions]
  }

  static set(key: string, value: unknown): void {
    const data = this.load()
    data[key] = value
    cache = data
    this.save()
  }

  static reset(): void {
    cache = {}
    this.save()
  }

  static all(): Record<string, unknown> {
    return { ...DEFAULTS, ...this.load() }
  }
}
