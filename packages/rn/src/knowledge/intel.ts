import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import type { IntelItem } from './refresh/types'

/**
 * Web intel → model context.
 *
 * Enables the model system prompt with the latest React Native ecosystem
 * headlines (releases, changelogs, newsletters) collected by `vectalon
 * refresh`. This is what keeps the model "cutting edge": generation follows
 * the newest ecosystem decisions instead of stale training knowledge. Mirrors
 * the ecosystem-skills enrichment (ecosystem/skills.ts) so local and remote
 * providers stay in lockstep.
 */

export interface WebIntelContextOptions {
  /** Max date headlines to inline (default 10). */
  maxItems?: number
  /** Total intel-section character cap (default 3000). */
  maxChars?: number
  /** Max age in ms for an item to be considered current (default 30 days). */
  maxAgeMs?: number
}

const DEFAULT_OPTIONS: Required<WebIntelContextOptions> = {
  maxItems: 10,
  maxChars: 3000,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
}

interface IntelCacheEntry {
  signature: string
  items: IntelItem[]
}

/**
 * Small memo: a feature run makes many model calls, and each would otherwise
 * re-read intel.json from disk. The signature is the file's mtime, so a
 * background refresh that rewrites the cache invalidates the memo (mirrors the
 * ecosystem-skills cache).
 */
const intelCache = new Map<string, IntelCacheEntry>()

/**
 * Read the persisted web-intel cache (.vectalon/knowledge/refresh/intel.json)
 * written by the KnowledgeRefreshService. Returns [] when absent/corrupt.
 */
export function readCachedIntel(root: string): IntelItem[] {
  try {
    const path = join(root, '.vectalon', 'knowledge', 'refresh', 'intel.json')
    if (!existsSync(path)) return []
    const signature = String(statSync(path).mtimeMs)
    const cached = intelCache.get(path)
    if (cached && cached.signature === signature) return cached.items
    const store = JSON.parse(readFileSync(path, 'utf-8')) as { items?: IntelItem[] }
    const items = Array.isArray(store.items) ? store.items : []
    if (intelCache.size > 50) intelCache.clear()
    intelCache.set(path, { signature, items })
    return items
  } catch (err) {
    reportError(err, 'web-intel: reading cached intel')
    return []
  }
}

/** Render intel items into a markdown prompt section. */
export function formatIntelContext(items: IntelItem[], options: WebIntelContextOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const now = Date.now()
  const current = items.filter(i => now - i.fetchedAt <= opts.maxAgeMs).slice(0, opts.maxItems)
  if (current.length === 0) return ''

  const parts: string[] = ['## Latest React Native ecosystem intel (current releases & news)', '']
  let budget = opts.maxChars
  for (const item of current) {
    if (budget <= 0) break
    const date = item.publishedAt ? ` (${item.publishedAt.slice(0, 10)})` : ''
    const url = item.url ? ` — ${item.url}` : ''
    const line = `- ${item.title}${date}${url}`
    parts.push(line)
    budget -= line.length
  }
  return parts.join('\n')
}

/**
 * Build the enriched system prompt for a project: the caller's system prompt
 * with the latest web intel appended. Returns the original systemPrompt
 * unchanged (or undefined) when no current intel is cached, so projects
 * without a refresh behave exactly as before.
 */
export function buildWebIntelSystemPrompt(
  root: string,
  systemPrompt?: string,
  options: WebIntelContextOptions = {}
): string | undefined {
  const section = formatIntelContext(readCachedIntel(root), options)
  if (!section) return systemPrompt
  if (!systemPrompt) return section
  return `${systemPrompt}\n\n${section}`
}

/**
 * Apply the intel loader when a project root is set; otherwise return the
 * system prompt unchanged. Shared by the local and remote providers so the
 * enrichment behavior stays in lockstep with the skills loader.
 */
export function enrichWithIntel(
  projectRoot: string | undefined,
  intelLoader: (root: string, systemPrompt?: string) => string | undefined,
  systemPrompt?: string
): string | undefined {
  if (!projectRoot) return systemPrompt
  return intelLoader(projectRoot, systemPrompt) ?? systemPrompt
}