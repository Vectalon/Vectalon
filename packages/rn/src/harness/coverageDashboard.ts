import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'

/**
 * Tracked home for the coverage dashboard — `docs/vectalon/coverage/` follows
 * the same committed convention as impact reports and visual baselines, so the
 * team sees E2E and accessibility coverage gaps in version control over time.
 */
export function coverageDocsDir(root: string): string {
  return join(root, 'docs', 'vectalon', 'coverage')
}

/** Path of the append-only coverage-gaps dashboard doc. */
export function coverageGapsDocPath(root: string): string {
  return join(coverageDocsDir(root), 'coverage-gaps.md')
}

export interface CoverageGapEntry {
  /** ISO date (`YYYY-MM-DD`) the entry was appended. */
  date: string
  workflowId: string
  runId: string
  prompt: string
  /**
   * E2E gaps: screens the impact stage flagged with no deterministic route,
   * for which no impact regression flow was generated. `followUpTaskId` is set
   * when the close phase opened a follow-up (with `followUpTaskUrl` when the
   * PM provider returned one); absent when an open follow-up already existed
   * (deduplicated).
   */
  e2eGaps: Array<{ screen: string; followUpTaskId?: string; followUpTaskUrl?: string }>
  /** a11y gaps: affected screens with no existing accessibility flow. */
  a11yGaps: string[]
}

function renderCoverageGapEntry(entry: CoverageGapEntry): string {
  const lines: string[] = []
  lines.push(`## ${entry.date} — ${entry.workflowId}/${entry.runId}`)
  lines.push('')
  lines.push(`Feature: ${entry.prompt}`)
  lines.push('')
  if (entry.e2eGaps.length > 0) {
    lines.push('### E2E coverage gaps (no deterministic route, no impact regression flow)')
    lines.push('')
    for (const gap of entry.e2eGaps) {
      lines.push(
        gap.followUpTaskId
          ? gap.followUpTaskUrl
            ? `- ${gap.screen} — follow-up \`${gap.followUpTaskId}\` opened ([open task](${gap.followUpTaskUrl}))`
            : `- ${gap.screen} — follow-up \`${gap.followUpTaskId}\` opened`
          : `- ${gap.screen} — already tracked (an open follow-up exists)`
      )
    }
    lines.push('')
  }
  if (entry.a11yGaps.length > 0) {
    lines.push('### Accessibility coverage gaps (no existing accessibility flow)')
    lines.push('')
    for (const screen of entry.a11yGaps) {
      lines.push(`- ${screen}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Append a dated entry to the committed coverage dashboard
 * (`docs/vectalon/coverage/coverage-gaps.md`). The doc accumulates one section
 * per run so the team can track E2E and accessibility gaps over time. Returns
 * the absolute path, or null when the write fails (best-effort, never throws).
 */
export function appendCoverageGapEntry(root: string, entry: CoverageGapEntry): string | null {
  try {
    const path = coverageGapsDocPath(root)
    const section = renderCoverageGapEntry(entry)
    if (!existsSync(path)) {
      mkdirSync(coverageDocsDir(root), { recursive: true })
      const header = [
        '# Coverage gaps — E2E and accessibility',
        '',
        'Appended by the close phase of each feature workflow run: screens the impact stage flagged with no deterministic route (E2E) and affected screens without accessibility coverage (a11y). Tracked so the team can see gaps over time.',
        '',
        '',
      ].join('\n')
      writeFileSync(path, header + section, 'utf-8')
    } else {
      appendFileSync(path, '\n' + section, 'utf-8')
    }
    return path
  } catch (err) {
    reportError(err, 'coverageDashboard: appending coverage gap entry')
    return null
  }
}

/**
 * Read the current coverage-gaps dashboard as raw markdown ('' when missing or
 * unreadable) — used by tests and any reporter that wants the accumulated log.
 */
export function readCoverageGapsDoc(root: string): string {
  try {
    const path = coverageGapsDocPath(root)
    return existsSync(path) ? readFileSync(path, 'utf-8') : ''
  } catch (err) {
    reportError(err, 'coverageDashboard: reading coverage gaps doc')
    return ''
  }
}

/**
 * Parse the dashboard markdown back into structured entries (the inverse of
 * `appendCoverageGapEntry`'s rendering). Entries appear in append order, so
 * the last entry with a screen is its most recent state.
 */
export function parseCoverageGapsDoc(markdown: string): CoverageGapEntry[] {
  const entries: CoverageGapEntry[] = []
  let current: CoverageGapEntry | null = null
  let section: 'e2e' | 'a11y' | null = null
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const header = line.match(/^## (\d{4}-\d{2}-\d{2}) — (\S+)\/(\S+)$/)
    if (header) {
      current = { date: header[1], workflowId: header[2], runId: header[3], prompt: '', e2eGaps: [], a11yGaps: [] }
      entries.push(current)
      section = null
      continue
    }
    if (!current) continue
    if (line.startsWith('Feature:')) {
      current.prompt = line.slice('Feature:'.length).trim()
      continue
    }
    if (line.startsWith('### E2E coverage gaps')) {
      section = 'e2e'
      continue
    }
    if (line.startsWith('### Accessibility coverage gaps')) {
      section = 'a11y'
      continue
    }
    if (section === 'e2e' && line.startsWith('- ')) {
      const gap = line.match(/^- (.+?) — (?:follow-up `([^`]+)` opened(?: \(\[open task\]\(([^)]+)\)\))?|already tracked \(.+\))$/)
      if (gap) current.e2eGaps.push({ screen: gap[1], followUpTaskId: gap[2], followUpTaskUrl: gap[3] })
    } else if (section === 'a11y' && line.startsWith('- ')) {
      const screen = line.slice(2).trim()
      if (screen && !current.a11yGaps.includes(screen)) current.a11yGaps.push(screen)
    }
  }
  return entries
}

/** Per-screen roll-up across all dashboard entries, for the coverage CLI. */
export interface ScreenCoverageSummary {
  screen: string
  /** Runs that recorded an E2E gap (no deterministic route) for this screen. */
  e2eRuns: number
  /** Runs that recorded an a11y gap (no accessibility flow) for this screen. */
  a11yRuns: number
  /** Date of the latest run that flagged this screen. */
  latestDate: string
  /** Follow-up task id from the latest run, when the close phase opened one. */
  followUpTaskId?: string
  /** Link to the open follow-up task, when the PM provider returned a URL. */
  followUpTaskUrl?: string
  /** True when the latest run found an already-open follow-up (deduplicated). */
  alreadyTracked: boolean
}

/**
 * Roll the parsed entries into one row per screen: run counts per gap kind,
 * plus the most recent follow-up state. Sorted by total gap runs desc, then
 * screen name — the noisiest gaps surface first.
 */
export function summarizeCoverageGaps(entries: CoverageGapEntry[]): ScreenCoverageSummary[] {
  const byScreen = new Map<string, ScreenCoverageSummary>()
  for (const entry of entries) {
    for (const gap of entry.e2eGaps) {
      const summary = byScreen.get(gap.screen) || {
        screen: gap.screen,
        e2eRuns: 0,
        a11yRuns: 0,
        latestDate: entry.date,
        alreadyTracked: false,
      }
      summary.e2eRuns++
      summary.latestDate = entry.date
      if (gap.followUpTaskId) {
        summary.followUpTaskId = gap.followUpTaskId
        summary.followUpTaskUrl = gap.followUpTaskUrl
        summary.alreadyTracked = false
      } else {
        summary.alreadyTracked = true
      }
      byScreen.set(gap.screen, summary)
    }
    for (const screen of entry.a11yGaps) {
      const summary = byScreen.get(screen) || {
        screen,
        e2eRuns: 0,
        a11yRuns: 0,
        latestDate: entry.date,
        alreadyTracked: false,
      }
      summary.a11yRuns++
      summary.latestDate = entry.date
      byScreen.set(screen, summary)
    }
  }
  return [...byScreen.values()].sort(
    (a, b) => b.e2eRuns + b.a11yRuns - (a.e2eRuns + a.a11yRuns) || a.screen.localeCompare(b.screen)
  )
}
