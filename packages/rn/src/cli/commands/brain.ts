/**
 * vc brain — the productized Team Brain (P1).
 * Business Source License 1.1 (BSL-1.1)
 *
 * The move from developer tool → organizational infrastructure:
 *
 *   vc brain "Why are we using Zustand instead of Redux?"
 *   Decision: ADR-017 — Use Zustand for state management
 *   Reason:   Performance + simplicity — less boilerplate, fewer re-renders
 *   Approved by: Architecture Team
 *   Related:  Checkout, Payments, Profile
 *   Reviewed: 2026-03
 *
 *   vc brain "Who understands our authentication architecture?"
 *   authentication — Owner: Team A · Experts: John, Priya
 *     ├── ADRs: 3
 *     ├── Services: 7
 *     └── Recent changes: 14
 *
 * Decision cards are parsed from the ADR files the brain indexes (the files
 * remain the source of truth); the expertise tree is derived from git
 * history grouped by area. Deterministic and offline. The full Team Brain
 * pass remains `vc team`.
 */
import { readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { indexDecisionFiles } from '../../teamBrain/decisions'
import { parseDecisionCard, buildAreaExpertise, answerBrainQuestion, renderBrainAnswer, renderDecisionCard, renderExpertiseTree, tokensOf, decisionMatches, isDecisionQuestion } from '../../teamBrain/qa'
import { deriveExpertise } from '../../teamBrain/expertise'
import type { DecisionCard } from '../../teamBrain/qa'

export interface BrainCommandOptions {
  /** Print machine-readable output. */
  json?: boolean
}

export interface BrainReport {
  question: string
  answer: ReturnType<typeof answerBrainQuestion>
  decisions: DecisionCard[]
  areas: ReturnType<typeof buildAreaExpertise>
}

/** Build the full brain Q&A context in one deterministic pass. */
export async function buildBrainReport(root: string): Promise<BrainReport> {
  // Decision cards — parsed from the ADR/decision files already indexed.
  const indexed = indexDecisionFiles(root)
  const decisions: DecisionCard[] = []
  for (const entry of indexed) {
    const full = join(root, entry.path)
    let content = ''
    let mtime = 0
    try {
      content = readFileSync(full, 'utf-8')
      mtime = statSync(full).mtimeMs
    } catch {
      continue
    }
    decisions.push(parseDecisionCard(entry, content, mtime))
  }

  // Area expertise — from the aggregated git entries, grouped by area.
  const expertise = await deriveExpertise(root)
  const areas = buildAreaExpertiseFromEntries(expertise, decisions)
  return { question: '', answer: { kind: 'expertise', areas: [], query: '' }, decisions, areas }
}

/** Derive area expertise from the aggregated entries (author → components/files). */
function buildAreaExpertiseFromEntries(
  entries: Array<{ author: string; commits: number; files: number; components: string[] }>,
  decisions: DecisionCard[]
): ReturnType<typeof buildAreaExpertise> {
  const areaFiles = new Map<string, Set<string>>()
  const areaAuthors = new Map<string, Map<string, number>>()
  for (const e of entries) {
    for (const component of e.components) {
      const area = componentArea(component)
      const set = areaFiles.get(area) || new Set<string>()
      set.add(component)
      areaFiles.set(area, set)
      const authors = areaAuthors.get(area) || new Map<string, number>()
      authors.set(e.author, (authors.get(e.author) || 0) + e.commits)
      areaAuthors.set(area, authors)
    }
  }
  const out: ReturnType<typeof buildAreaExpertise> = []
  for (const [area, files] of areaFiles) {
    const ranked = [...(areaAuthors.get(area) || new Map()).entries()].sort((a, b) => b[1] - a[1])
    out.push({
      area,
      owner: ranked[0]?.[0] ?? null,
      experts: ranked.slice(1, 5).map(([a]) => a),
      adrs: decisions.filter(d =>
        d.related.some(r => r.toLowerCase().includes(area)) ||
        d.title.toLowerCase().includes(area) ||
        d.reason.toLowerCase().includes(area)
      ).length,
      services: files.size,
      recentChanges: files.size,
    })
  }
  return out.sort((a, b) => b.recentChanges - a.recentChanges)
}

/** The area a PascalCase component belongs to (best effort via name hints). */
function componentArea(component: string): string {
  const lower = component.toLowerCase()
  if (/(screen|page|view$)/.test(lower)) return 'screens'
  if (/(api|client|service|repository)/.test(lower)) return 'services'
  if (/(store|context|provider|atom|hook)/.test(lower)) return 'state'
  if (/(nav|stack|tab|route)/.test(lower)) return 'navigation'
  if (/(card|button|input|modal|list|item|badge|chip)/.test(lower)) return 'components'
  return 'other'
}

/** Ask the brain a question. */
export function askBrain(report: BrainReport, question: string): ReturnType<typeof answerBrainQuestion> {
  const tokens = tokensOf(question)
  // Decision question or any question with a matching decision → decision card.
  const scored = report.decisions.map(card => ({ card, score: decisionMatches(card, tokens) }))
  const best = scored.sort((a, b) => b.score - a.score)[0]
  if (isDecisionQuestion(question) || (best && best.score > 0 && report.decisions.length > 0)) {
    return {
      kind: 'decision',
      card: best && best.score > 0 ? best.card : report.decisions[0] ?? null,
      query: question,
    }
  }
  // Expertise question → the top areas.
  const ranked = [...report.areas].sort(
    (a, b) => areaTokenScore(b, tokens) - areaTokenScore(a, tokens)
  )
  return { kind: 'expertise', areas: ranked.slice(0, 5), query: question }
}

function areaTokenScore(area: ReturnType<typeof buildAreaExpertise>[number], tokens: string[]): number {
  const haystack = `${area.area} ${area.owner ?? ''} ${area.experts.join(' ')}`.toLowerCase()
  return tokens.filter(t => haystack.includes(t)).length
}

export async function brainCommand(question: string, options: BrainCommandOptions): Promise<void> {
  const root = resolve(process.cwd())
  const report = await buildBrainReport(root)
  const answer = question ? askBrain(report, question) : { kind: 'expertise' as const, areas: report.areas.slice(0, 5), query: '' }

  if (options.json) {
    process.stdout.write(JSON.stringify({ question, decisions: report.decisions, areas: report.areas, answer }, null, 2) + '\n')
    return
  }

  const body: string[] = []
  if (question) {
    body.push(`${parchment('Ask:')} "${question}"`)
    body.push('')
    body.push(...renderBrainAnswer(answer))
  } else {
    // No question → the whole brain at a glance.
    body.push(parchment('The Team Brain — organizational infrastructure'))
    body.push('')
    if (report.decisions.length > 0) {
      body.push(pc.bold(`Decisions (${report.decisions.length})`))
      body.push('')
      for (const d of report.decisions.slice(0, 6)) {
        body.push(...renderDecisionCard(d).map(l => `  ${l}`))
        body.push('')
      }
      if (report.decisions.length > 6) body.push(dim(`  … +${report.decisions.length - 6} more`))
      body.push('')
    }
    if (report.areas.length > 0) {
      body.push(pc.bold('Expertise by area'))
      body.push('')
      for (const a of report.areas.slice(0, 6)) {
        body.push(...renderExpertiseTree(a).map(l => `  ${l}`))
        body.push('')
      }
    }
    body.push(dim('Ask a question — e.g. "Why are we using Zustand instead of Redux?" or "Who understands our authentication architecture?"'))
  }

  const verdict = (answer.kind === 'decision' && answer.card) || (answer.kind === 'expertise' && answer.areas.length > 0)
    ? 'approved'
    : 'needs-attention'
  printCarbonReport({
    title: 'vectalon brain — the Team Brain',
    verdict,
    lines: body,
    reportPath: join(root, 'docs', 'vectalon', 'brain', 'report.txt'),
    root,
    footer: 'deterministic · ADR files are the source of truth',
    done: question
      ? `Answered: "${question}"`
      : `Team Brain — ${report.decisions.length} decisions · ${report.areas.length} areas.`,
  })
}
