/**
 * vectalon team brain — the productized Q&A surface (P1).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Turns the team brain from artifacts into organizational infrastructure:
 *
 *   "Why are we using Zustand instead of Redux?"
 *   Decision: ADR-017 · Reason: Performance + simplicity · Approved by:
 *   Architecture Team · Related: Checkout, Payments, Profile · Reviewed:
 *   March 2026
 *
 *   "Who understands our authentication architecture?"
 *   authentication — Owner: Team A · Experts: John, Priya · ADRs: 3 ·
 *   Services: 7 · Recent changes: 14
 *
 * The decision card is parsed from the ADR files the brain already indexes
 * (the files remain the source of truth); the expertise tree is derived from
 * git history grouped by area (screens/, services/, features/, state/…).
 * Deterministic, offline, and hermetic-testable (injectable git logs).
 */
import type { DecisionIndexEntry, ExpertiseEntry } from './types'
import type { ParsedCommit } from './expertise'
import { parseGitAuthors, parseGitFiles, aggregateExpertise } from './expertise'

// ---------------------------------------------------------------------------
// Rich decision parsing — the ADR files are the source of truth.
// ---------------------------------------------------------------------------

export interface DecisionCard {
  id: string
  title: string
  /** The `## Decision` / `## Context` body — why. */
  reason: string
  /** `Deciders:` / `Approved by:` / `## Deciders` — who signed off. */
  approvedBy: string[]
  /** `Related:` / `Related ADRs:` / `## Related` — what it touches. */
  related: string[]
  /** Last reviewed date (Status date or file mtime, YYYY-MM). */
  reviewed: string | null
  status?: string
  path: string
}

/** Parse a decision's body into the card fields (lenient — missing = []). */
export function parseDecisionCard(entry: DecisionIndexEntry, content: string, mtime: number): DecisionCard {
  const section = (name: string): string => {
    const re = new RegExp(`^##\\s+${name}\\s*$`, 'm')
    const m = content.match(re)
    if (!m) return ''
    const rest = content.slice(m.index! + m[0].length)
    const next = rest.match(/^##\s/m)
    return (next ? rest.slice(0, next.index) : rest)
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 200)
  }

  const key = (label: string): string[] => {
    const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'im')
    const m = content.match(re)
    if (!m) return []
    return m[1].split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 8)
  }

  const decision = section('Decision')
  const context = section('Context')
  const reason = decision || context

  const approvedBy = key('Approved by').length > 0
    ? key('Approved by')
    : key('Deciders')

  // Prefer the plain `Related:` (features/areas) over `Related ADRs:`
  // (ADR references) — the P1 card shows what the decision touches.
  const related = key('Related').length > 0
    ? key('Related')
    : key('Related ADRs')

  // Last reviewed: a date in the Status section, else the file's mtime.
  const statusSection = section('Status')
  const dateInStatus = statusSection.match(/([A-Z][a-z]{2,8}\s+\d{4}|\d{4}-\d{2})/)
  const reviewed = dateInStatus
    ? dateInStatus[1]
    : new Date(mtime).toISOString().slice(0, 7)

  return {
    id: entry.id,
    title: entry.title,
    reason: reason || 'See the ADR body — no Decision/Context section found.',
    approvedBy,
    related,
    reviewed,
    status: entry.status,
    path: entry.path,
  }
}

// ---------------------------------------------------------------------------
// Area expertise — git history grouped by functional area.
// ---------------------------------------------------------------------------

const AREA_DIRS: Array<[string, RegExp]> = [
  ['screens', /(^|\/)screens\//],
  ['services', /(^|\/)services\//],
  ['features', /(^|\/)features\//],
  ['state', /(^|\/)(state|store|stores|redux|zustand)\//],
  ['navigation', /(^|\/)(navigation|navigator|routes?)\//],
  ['hooks', /(^|\/)hooks\//],
  ['components', /(^|\/)components\//],
  ['api', /(^|\/)(api|api-client|graphql)\//],
  ['utils', /(^|\/)(utils|lib|helpers)\//],
  ['tests', /(^|\/)(__tests__|tests?|e2e|maestro)\//],
]

/** The area a relative file belongs to (first match), else 'other'. */
export function areaOfFile(relPath: string): string {
  for (const [area, re] of AREA_DIRS) {
    if (re.test(relPath)) return area
  }
  return 'other'
}

export interface AreaExpertise {
  area: string
  /** The most active author — the person to ask first. */
  owner: string | null
  /** Top authors beyond the owner (up to 4). */
  experts: string[]
  /** ADR/decision files that mention the area. */
  adrs: number
  /** Distinct files in the area. */
  services: number
  /** Distinct files touched (recent changes). */
  recentChanges: number
}

/** Group expertise by area from parsed git history. */
export function buildAreaExpertise(
  commits: ParsedCommit[],
  filesByCommit: Map<string, string[]>,
  decisions: DecisionCard[]
): AreaExpertise[] {
  const areaCommits = new Map<string, string[]>() // area → authors
  const areaFiles = new Map<string, Set<string>>() // area → files
  for (const commit of commits) {
    const files = filesByCommit.get(commit.hash) || []
    const touched = new Set<string>()
    for (const f of files) touched.add(areaOfFile(f))
    for (const area of touched) {
      const authors = areaCommits.get(area) || []
      authors.push(commit.author)
      areaCommits.set(area, authors)
      const set = areaFiles.get(area) || new Set<string>()
      for (const f of files) if (areaOfFile(f) === area) set.add(f)
      areaFiles.set(area, set)
    }
  }

  const out: AreaExpertise[] = []
  for (const [area, authors] of areaCommits) {
    const counts = new Map<string, number>()
    for (const a of authors) counts.set(a, (counts.get(a) || 0) + 1)
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const owner = ranked[0]?.[0] ?? null
    const experts = ranked.slice(1, 5).map(([a]) => a)
    const adrCount = decisions.filter(d =>
      d.related.some(r => r.toLowerCase().includes(area)) ||
      d.title.toLowerCase().includes(area) ||
      d.reason.toLowerCase().includes(area)
    ).length
    out.push({
      area,
      owner,
      experts,
      adrs: adrCount,
      services: areaFiles.get(area)?.size ?? 0,
      recentChanges: areaFiles.get(area)?.size ?? 0,
    })
  }
  return out.sort((a, b) => b.recentChanges - a.recentChanges)
}

// ---------------------------------------------------------------------------
// The question surface.
// ---------------------------------------------------------------------------

export type BrainAnswer =
  | { kind: 'decision'; card: DecisionCard | null; query: string }
  | { kind: 'expertise'; areas: AreaExpertise[]; query: string }

/** English stopwords — no signal for decision/area matching. */
const STOPWORDS = new Set([
  'the', 'and', 'are', 'for', 'with', 'our', 'your', 'what', 'which', 'why', 'who',
  'how', 'does', 'do', 'we', 'you', 'use', 'using', 'used', 'it', 'this', 'that',
  'was', 'were', 'been', 'have', 'has', 'had', 'not', 'but', 'its', 'our', 'about',
])

/** Tokenize a question into lowercase significant words (stopwords dropped). */
export function tokensOf(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOPWORDS.has(t))
}

/** Does a decision card match the question tokens? */
export function decisionMatches(card: DecisionCard, tokens: string[]): number {
  const haystack = `${card.title} ${card.reason} ${card.id} ${card.related.join(' ')}`.toLowerCase()
  return tokens.filter(t => haystack.includes(t)).length
}

/** Does an area match? */
export function areaMatches(area: string, tokens: string[]): number {
  return tokens.filter(t => area.includes(t)).length
}

/** Is the question asking about a decision ("why", "which", "what's the decision")? */
export function isDecisionQuestion(query: string): boolean {
  return /\b(why|which|what'?s the (decision|reason)|decision|adr|why are we|why do we)\b/i.test(query)
}

/** The full answer — decision card or expertise tree. Deterministic. */
export function answerBrainQuestion(
  root: string,
  query: string,
  decisions: DecisionCard[],
  expertise: AreaExpertise[]
): BrainAnswer {
  const tokens = tokensOf(query)
  if (isDecisionQuestion(query) || decisions.length > 0) {
    let best: DecisionCard | null = null
    let bestScore = 0
    for (const card of decisions) {
      const score = decisionMatches(card, tokens)
      if (score > bestScore) {
        bestScore = score
        best = card
      }
    }
    return { kind: 'decision', card: best, query }
  }
  // Expertise: score areas, pick the top 5.
  const scored = expertise
    .map(a => ({ area: a, score: areaMatches(a.area, tokens) + (tokens.length === 0 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
  return { kind: 'expertise', areas: scored.slice(0, 5).map(s => s.area), query }
}

// ---------------------------------------------------------------------------
// Rendering — the two card shapes from the P1 spec.
// ---------------------------------------------------------------------------

/** The decision card, exactly the P1 shape. */
export function renderDecisionCard(card: DecisionCard): string[] {
  const lines: string[] = []
  lines.push(`Decision: ${card.id} — ${card.title}`)
  lines.push(`Reason:   ${card.reason}`)
  lines.push(`Approved by: ${card.approvedBy.length > 0 ? card.approvedBy.join(', ') : '—'}`)
  lines.push(`Related:  ${card.related.length > 0 ? card.related.join(', ') : '—'}`)
  lines.push(`Reviewed: ${card.reviewed ?? '—'}`)
  if (card.status) lines.push(`Status:   ${card.status}`)
  return lines
}

/** The expertise tree — owner, experts, ADRs, services, changes. */
export function renderExpertiseTree(area: AreaExpertise): string[] {
  const lines: string[] = []
  lines.push(`${area.area} — Owner: ${area.owner ?? '—'} · Experts: ${area.experts.join(', ') || '—'}`)
  lines.push(`  ├── ADRs: ${area.adrs}`)
  lines.push(`  ├── Services: ${area.services}`)
  lines.push(`  └── Recent changes: ${area.recentChanges}`)
  return lines
}

/** Render the full answer as terminal lines. */
export function renderBrainAnswer(answer: BrainAnswer): string[] {
  if (answer.kind === 'decision') {
    if (!answer.card) {
      return ['No matching decision found. Record one in docs/adr/ and it will be answerable here.', `Query: ${answer.query}`]
    }
    return renderDecisionCard(answer.card)
  }
  if (answer.areas.length === 0) {
    return ['No expertise map yet — the brain needs git history with commits.', `Query: ${answer.query}`]
  }
  const lines: string[] = []
  answer.areas.forEach((area, i) => {
    lines.push(...renderExpertiseTree(area))
    if (i < answer.areas.length - 1) lines.push('')
  })
  return lines
}

/** Re-export for tests + consumers. */
export { parseGitAuthors, parseGitFiles, aggregateExpertise }
export type { ExpertiseEntry }
