import { existsSync } from 'fs'
import { join } from 'path'
import { KnowledgeRefreshService } from '../knowledge/refresh'

/**
 * Staleness-aware hint for the interactive menu's "Force refresh knowledge"
 * entry: names how long ago the web intel was last pulled when the cache is
 * stale, and says it forces a pull when fresh. Read-only — never creates
 * `.vectalon/` as a side effect of listing menu options (the menu is
 * reachable on a virgin project, where creating workspace dirs would be a
 * surprise).
 */
export function buildRefreshHint(root: string): string {
  if (!existsSync(join(root, '.vectalon'))) {
    return 'on-demand web intel + suggestions — serve auto-refreshes hourly'
  }
  const service = new KnowledgeRefreshService({ projectRoot: root })
  if (!service.isStale()) {
    return 'up to date, forces a pull anyway'
  }
  const lastRefreshAt = service.getLastRefreshAt()
  return lastRefreshAt > 0 ? `stale (last refresh ${timeAgoLabel(lastRefreshAt)})` : 'stale (never refreshed)'
}

/** Compact relative timestamp ("42s ago", "6h ago", "3d ago") for menu hints. */
export function timeAgoLabel(epochMs: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - epochMs) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
