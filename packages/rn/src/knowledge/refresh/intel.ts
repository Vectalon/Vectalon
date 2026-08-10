import { reportError } from '../../utils/safe'
import type { FetchedDocument, KnowledgeSource, IntelItem } from './types'

/**
 * Web intel — React Native ecosystem headlines.
 *
 * Vectalon keeps itself (and its model) current by reading the ecosystem's
 * pulse: release announcements, changelogs, community newsletters, Hacker
 * News discussions, and GitHub's most-starred React Native repositories.
 * This module turns raw fetched content into a short list of dated headlines
 * that (a) refresh output can print, and (b) the local/WASM/remote model
 * system prompt inlines so generation follows the latest ecosystem decisions,
 * not stale training knowledge.
 *
 * Supported wire formats:
 * - RSS 2.0 / Atom feeds (`<item>` / `<entry>` blocks)
 * - JSON APIs with `hits` (Hacker News Algolia) or `items` (GitHub search)
 * - Generic HTML pages (heading + first-anchor scraping fallback)
 */

/** Source types whose content is headline-eligible (news + changelogs). */
const INTEL_SOURCE_TYPES = new Set(['news', 'changelog'])

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i
const LINK_HREF_RE = /<link[^>]*href="([^"]+)"[^>]*\/?>/i
const LINK_TEXT_RE = /<link>([^<]+)<\/link>/i
const ITEM_RE = /<item[\s\S]*?<\/item>/gi
const ENTRY_RE = /<entry[\s\S]*?<\/entry>/gi
const H_RE = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi
const ANCHOR_RE = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

/** Extract a link URL from a feed block — Atom href attribute or RSS link text. */
function extractLink(block: string): string {
  return block.match(LINK_HREF_RE)?.[1] || block.match(LINK_TEXT_RE)?.[1] || ''
}

function stripEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(html: string): string {
  return stripEntities(html.replace(/<[^>]+>/g, ' '))
}

/** Extract `<item>` (RSS) or `<entry>` (Atom) blocks from feed XML. */
function extractFeedBlocks(content: string): string[] {
  const blocks: string[] = []
  for (const re of [ITEM_RE, ENTRY_RE]) {
    for (const match of content.matchAll(re)) blocks.push(match[0])
  }
  return blocks
}

/** A headline candidate from a parsed JSON payload. */
interface JsonIntelHit {
  title?: string
  /** HN stories carry `title` + `url` + `objectID`; GitHub repos carry `full_name` + `html_url`. */
  url?: string
  full_name?: string
  html_url?: string
  objectID?: string
  /** Date strings: HN `created_at`, GitHub `created_at`. */
  created_at?: string
}

/**
 * Normalize a parsed JSON feed into headline candidates:
 * - Hacker News Algolia (`hits` array): title + url (fallback to the item
 *   page) + created_at
 * - GitHub search (`items` array): full_name + html_url + created_at
 * - Generic: a bare array of `{ title, url, created_at }`
 */
function jsonHits(payload: unknown): JsonIntelHit[] {
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  const raw: unknown = Array.isArray(payload) ? payload : obj.hits ?? obj.items ?? []
  if (!Array.isArray(raw)) return []
  return raw.filter((h): h is JsonIntelHit => !!h && typeof h === 'object')
}

/**
 * Extract dated headlines from a fetched document. Handles RSS 2.0 / Atom
 * feeds, JSON APIs (HN Algolia `hits`, GitHub search `items`), and falls back
 * to scraping heading + first-anchor pairs from HTML pages. Deduplicates by
 * normalized title and returns at most 20 items, newest first when dates are
 * available.
 */
export function extractIntelItems(
  source: KnowledgeSource,
  content: string,
  fetchedAt: number
): IntelItem[] {
  if (!INTEL_SOURCE_TYPES.has(source.type)) return []

  const items: IntelItem[] = []
  const seen = new Set<string>()

  const push = (title: string, url: string, publishedAt?: string): void => {
    const cleanTitle = stripEntities(title)
    const key = cleanTitle.toLowerCase()
    if (!cleanTitle || cleanTitle.length < 4 || seen.has(key)) return
    seen.add(key)
    items.push({ sourceId: source.id, sourceName: source.name, title: cleanTitle, url, publishedAt, fetchedAt })
  }

  const trimmed = content.trim()

  // JSON feeds (Hacker News Algolia, GitHub search API).
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      for (const hit of jsonHits(parsed)) {
        const title = hit.title || hit.full_name || ''
        const url =
          hit.url ||
          hit.html_url ||
          (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : '')
        push(title, url, hit.created_at)
      }
    } catch (err) {
      // Not actually JSON (or truncated) — fall through to the HTML scraper.
      reportError(err, `web-intel: parsing JSON feed ${source.id}`)
    }
  }

  // RSS / Atom feeds.
  if (items.length === 0) {
    const blocks = extractFeedBlocks(content)
    if (blocks.length > 0) {
      for (const block of blocks) {
        const title = block.match(TITLE_RE)?.[1] || ''
        const link = extractLink(block)
        const date =
          block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ||
          block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ||
          block.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]
        push(title, link, date ? stripEntities(date) : undefined)
      }
    }
  }

  // HTML fallback: heading text + the first same-page anchor under it.
  if (items.length === 0) {
    const headings = [...content.matchAll(H_RE)]
    for (const match of headings) {
      const title = stripHtml(match[2])
      if (title.length < 4) continue
      const after = content.slice(match.index! + match[0].length, match.index! + match[0].length + 4000)
      const anchor = after.match(ANCHOR_RE)
      push(title, anchor?.[1] || '', undefined)
    }
  }

  // Newest first when any dates are known; stable otherwise.
  if (items.some(i => i.publishedAt)) {
    items.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
  }

  return items.slice(0, 20)
}

/** Collect intel from every headline-eligible fetched document. */
export function collectIntel(documents: FetchedDocument[], sourceOf: (id: string) => KnowledgeSource | undefined): IntelItem[] {
  const items: IntelItem[] = []
  for (const doc of documents) {
    const source = sourceOf(doc.sourceId)
    if (!source) continue
    items.push(...extractIntelItems(source, doc.content, doc.fetchedAt))
  }
  return items
}