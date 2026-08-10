import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { reportError } from '../utils/safe'
import type { Pattern } from './PatternLearner'
import type { DecisionRecord } from './ProjectMemory'

/**
 * MemoryDistiller — L0→L3 agent memory distillation.
 *
 * Inspired by the leveled memory pattern popularized by agent-memory hubs
 * (e.g. TencentDB-Agent-Memory): raw session transcripts (L0) distill into
 * atomic facts (L1), reusable scenario knowledge (L2), and a stable project
 * persona (L3). Everything here is deterministic — no model calls — so it
 * works fully offline and never depends on an LLM being available.
 *
 * Persistence lives under .vectalon/knowledge/memory/distilled.json (the
 * same knowledge directory the artifact store and web intel use), and the
 * enriched system prompt is built exactly like web intel
 * (knowledge/intel.ts), so providers stay in lockstep.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FactCategory = 'convention' | 'dependency' | 'error' | 'decision' | 'pattern'

export interface MemorySessionEntry {
  kind: 'prompt' | 'answer' | 'tool' | 'error'
  /** Tool / phase id when kind === 'tool'. */
  tool?: string
  text: string
  at: number
}

/**
 * A fact the caller already knows about a session — either a plain statement
 * (category inferred) or an explicit (category, statement) pair.
 */
export type SessionFact = string | { category: FactCategory; statement: string }

/** L0 — a raw session record (one workflow run, one serve conversation, …). */
export interface MemorySession {
  id: string
  workflowId: string
  startedAt: number
  endedAt: number
  outcome: 'completed' | 'failed'
  /** One-line summary of what the session was about. */
  summary: string
  /** Files created or modified during the session (repo-relative). */
  files: string[]
  /** Structured facts the caller already knows about this session. */
  facts: SessionFact[]
  entries: MemorySessionEntry[]
}

/** L1 — an atomic, deduplicated fact about the project. */
export interface MemoryFact {
  id: string
  sessionId: string
  category: FactCategory
  statement: string
  at: number
  /** Session ids that produced this fact — drives scenario occurrences. */
  sessions: string[]
}

/** L2 — scenario knowledge: a reusable lesson, weighted by occurrences. */
export interface MemoryScenario {
  id: string
  category: FactCategory
  statement: string
  occurrences: number
  firstSeen: number
  lastSeen: number
}

/** L3 — the stable project persona distilled from everything below. */
export interface MemoryPersona {
  stack: string[]
  conventions: string[]
  painPoints: string[]
  updatedAt: number
}

export interface DistilledMemory {
  version: 1
  sessions: MemorySession[]
  facts: MemoryFact[]
  scenarios: MemoryScenario[]
  persona: MemoryPersona
}

export interface MemoryDistillOptions {
  /** Max raw sessions kept (oldest dropped). */
  maxSessions?: number
  /** Max facts kept (oldest dropped). */
  maxFacts?: number
  /** Max scenarios kept (lowest-occurrence dropped). */
  maxScenarios?: number
}

const DEFAULT_LIMITS: Required<MemoryDistillOptions> = {
  maxSessions: 20,
  maxFacts: 200,
  maxScenarios: 100,
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function memoryFilePath(root: string): string {
  return join(root, '.vectalon', 'knowledge', 'memory', 'distilled.json')
}

function emptyMemory(): DistilledMemory {
  return {
    version: 1,
    sessions: [],
    facts: [],
    scenarios: [],
    persona: { stack: [], conventions: [], painPoints: [], updatedAt: 0 },
  }
}

function readMemory(root: string): DistilledMemory {
  try {
    const path = memoryFilePath(root)
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<DistilledMemory>
      if (parsed && Array.isArray(parsed.sessions) && Array.isArray(parsed.facts)) {
        return parsed as DistilledMemory
      }
    }
  } catch (err) {
    reportError(err, 'memory: reading distilled memory')
  }
  return emptyMemory()
}

function writeMemory(root: string, memory: DistilledMemory): void {
  try {
    const path = memoryFilePath(root)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(memory, null, 2))
  } catch (err) {
    reportError(err, 'memory: writing distilled memory')
  }
}

// ---------------------------------------------------------------------------
// Deterministic distillation
// ---------------------------------------------------------------------------

const DEPENDENCY_RE = /\b(install|add(ed)?|upgrade(d)?|bump(ed)?|removed?|depends? on)\b/i
const ERROR_RE = /\b(error|fail(ed|ure)?|crash(ed)?|fix(ed)?|bug|regression)\b/i
const CONVENTION_RE = /\b(naming|convention|style|pattern|pascal|camel|kebab|prefer)\b/i

function inferCategory(statement: string, fallback: FactCategory): FactCategory {
  if (ERROR_RE.test(statement)) return 'error'
  if (DEPENDENCY_RE.test(statement)) return 'dependency'
  if (CONVENTION_RE.test(statement)) return 'convention'
  return fallback
}

function factId(sessionId: string, i: number | string): string {
  return `${sessionId}::f${i}`
}

function scenarioId(category: FactCategory, statement: string): string {
  let hash = 5381
  const key = `${category}::${statement.toLowerCase().trim()}`
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i)
    hash |= 0
  }
  return `sc-${(hash >>> 0).toString(16)}`
}

const PATTERN_CATEGORY_MAP: Record<Pattern['category'], FactCategory> = {
  naming: 'convention',
  styling: 'convention',
  architecture: 'pattern',
  routing: 'pattern',
  state: 'pattern',
  testing: 'pattern',
}

export class MemoryDistiller {
  private readonly root: string
  private readonly limits: Required<MemoryDistillOptions>

  constructor(root: string, options: MemoryDistillOptions = {}) {
    this.root = root
    this.limits = { ...DEFAULT_LIMITS, ...options }
  }

  /** Current distilled memory (empty when nothing has been learned yet). */
  read(): DistilledMemory {
    return readMemory(this.root)
  }

  /**
   * L1 source: existing ProjectMemory patterns (naming/styling/routing/…)
   * become convention/pattern facts with the pattern's confidence.
   */
  learnFromPatterns(patterns: Pattern[]): void {
    const memory = this.read()
    const known = new Set(memory.facts.map(f => `${f.category}::${f.statement.toLowerCase()}`))
    const added: MemoryFact[] = []
    for (const pattern of patterns) {
      const statement = pattern.description || pattern.pattern
      const category = PATTERN_CATEGORY_MAP[pattern.category] ?? 'pattern'
      const key = `${category}::${statement.toLowerCase()}`
      if (known.has(key)) continue
      known.add(key)
      added.push({
        id: factId('patterns', added.length),
        sessionId: 'patterns',
        category,
        statement,
        at: pattern.lastSeen,
        sessions: ['patterns'],
      })
    }
    if (added.length === 0) return
    memory.facts = [...added, ...memory.facts].slice(0, this.limits.maxFacts)
    this.recompute(memory)
  }

  /** L1 source: decisions recorded through ProjectMemory.recordDecision. */
  learnFromDecisions(decisions: DecisionRecord[]): void {
    const memory = this.read()
    const known = new Set(memory.facts.map(f => `${f.category}::${f.statement.toLowerCase()}`))
    const added: MemoryFact[] = []
    for (const decision of decisions) {
      const statement = decision.outcome
        ? `${decision.action}: ${decision.outcome}`
        : decision.action
      const key = `decision::${statement.toLowerCase()}`
      if (known.has(key)) continue
      known.add(key)
      added.push({
        id: factId('decisions', added.length),
        sessionId: 'decisions',
        category: 'decision',
        statement,
        at: decision.timestamp,
        sessions: ['decisions'],
      })
    }
    if (added.length === 0) return
    memory.facts = [...added, ...memory.facts].slice(0, this.limits.maxFacts)
    this.recompute(memory)
  }

  /**
   * L0→L3: record a raw session, extract its facts, upsert scenario
   * knowledge, refresh the persona, and persist. All deterministic.
   */
  ingestSession(session: MemorySession): DistilledMemory {
    const memory = this.read()

    // L0 — keep the raw session (capped, newest first). Entry text is capped
    // defensively so the JSON store can't balloon regardless of the caller.
    const cappedSession: MemorySession = {
      ...session,
      entries: session.entries.map(e => ({ ...e, text: e.text.slice(0, 600) })),
    }
    memory.sessions = [cappedSession, ...memory.sessions].slice(0, this.limits.maxSessions)

    // L1 — extract structured facts from the session. Facts are deduped by
    // (category, statement); re-ingesting the same fact from a new session
    // records that session id so scenario occurrences reflect session counts.
    const factByKey = new Map(memory.facts.map(f => [`${f.category}::${f.statement.toLowerCase()}`, f]))
    const extracted: MemoryFact[] = []
    const touch = (category: FactCategory, statement: string, at: number): void => {
      const key = `${category}::${statement.toLowerCase()}`
      const existing = factByKey.get(key)
      if (existing) {
        if (!existing.sessions.includes(session.id)) existing.sessions.push(session.id)
        // Keep `at` current so scenario lastSeen reflects the most recent
        // session that produced this fact.
        existing.at = Math.max(existing.at, at)
        return
      }
      factByKey.set(key, {} as MemoryFact)
      extracted.push({
        id: factId(session.id, extracted.length),
        sessionId: session.id,
        category,
        statement,
        at,
        sessions: [session.id],
      })
    }
    for (const fact of session.facts) {
      const statement = typeof fact === 'string' ? fact.trim() : fact.statement.trim()
      if (!statement) continue
      const category = typeof fact === 'string' ? inferCategory(statement, 'decision') : fact.category
      touch(category, statement, session.endedAt)
    }
    // Phase outputs surface code-review findings (🔴/🟡/🔵) as error facts.
    for (const entry of session.entries) {
      if (entry.kind !== 'tool' || !entry.text) continue
      for (const line of entry.text.split('\n')) {
        const trimmed = line.trim()
        const m = trimmed.match(/^\s*(🔴|🟡|🔵)\s+(.+)$/)
        if (!m) continue
        touch('error', `${entry.tool ?? 'review'}: ${m[2].trim()}`, session.endedAt)
      }
    }
    if (extracted.length > 0) {
      memory.facts = [...extracted, ...memory.facts].slice(0, this.limits.maxFacts)
    }

    this.recompute(memory)
    return memory
  }

  /** Recompute L2 (scenarios) + L3 (persona) from L1, then persist. */
  private recompute(memory: DistilledMemory): void {
    // L2 — one scenario per fact (L1 is already deduped by category +
    // statement); occurrences = the number of sessions that produced it, so
    // repeated lessons rank above one-offs. Legacy facts without a sessions
    // array count as a single session.
    const scenarios = memory.facts.map<MemoryScenario>(fact => {
      const sessions = Array.isArray(fact.sessions) && fact.sessions.length > 0 ? fact.sessions : [fact.sessionId]
      return {
        id: scenarioId(fact.category, fact.statement),
        category: fact.category,
        statement: fact.statement,
        occurrences: new Set(sessions).size,
        firstSeen: fact.at,
        lastSeen: fact.at,
      }
    })
    memory.scenarios = scenarios
      .sort((a, b) => b.occurrences - a.occurrences || b.lastSeen - a.lastSeen)
      .slice(0, this.limits.maxScenarios)

    // L3 — aggregate the persona from scenario knowledge.
    const persona = memory.persona
    persona.stack = [...new Set(memory.scenarios.filter(s => s.category === 'dependency').map(s => s.statement))].slice(0, 8)
    persona.conventions = [...new Set(
      memory.scenarios.filter(s => s.category === 'convention' || s.category === 'pattern').map(s => s.statement)
    )].slice(0, 8)
    persona.painPoints = [...new Set(memory.scenarios.filter(s => s.category === 'error').map(s => s.statement))].slice(0, 5)
    persona.updatedAt = Date.now()

    writeMemory(this.root, memory)
  }
}

// ---------------------------------------------------------------------------
// Model-prompt enrichment (mirrors knowledge/intel.ts)
// ---------------------------------------------------------------------------

export interface MemoryContextOptions {
  /** Max scenario lessons to inline (default 8). */
  maxScenarios?: number
  /** Total memory-section character cap (default 2500). */
  maxChars?: number
}

const MEMORY_OPTIONS: Required<MemoryContextOptions> = {
  maxScenarios: 8,
  maxChars: 2500,
}

interface MemoryCacheEntry {
  signature: string
  memory: DistilledMemory
}

/** mtime-keyed memo so a feature run's many model calls don't re-read disk. */
const memoryCache = new Map<string, MemoryCacheEntry>()

function readCachedMemory(root: string): DistilledMemory {
  try {
    const path = memoryFilePath(root)
    if (!existsSync(path)) return emptyMemory()
    const signature = String(statSync(path).mtimeMs)
    const cached = memoryCache.get(path)
    if (cached && cached.signature === signature) return cached.memory
    const memory = readMemory(root)
    if (memoryCache.size > 50) memoryCache.clear()
    memoryCache.set(path, { signature, memory })
    return memory
  } catch (err) {
    reportError(err, 'memory: reading cached memory')
    return emptyMemory()
  }
}

/**
 * Render the distilled memory into a markdown prompt section: the project
 * persona (L3) plus the top scenario lessons (L2). Returns '' when the
 * project has nothing learned yet, so projects without memory behave exactly
 * as before.
 */
export function formatMemoryContext(root: string, options: MemoryContextOptions = {}): string {
  const opts = { ...MEMORY_OPTIONS, ...options }
  const memory = readCachedMemory(root)
  const persona = memory.persona
  const hasPersona = persona.stack.length > 0 || persona.conventions.length > 0 || persona.painPoints.length > 0
  const scenarios = memory.scenarios.filter(s => s.category !== 'dependency').slice(0, opts.maxScenarios)
  if (!hasPersona && scenarios.length === 0) return ''

  const parts: string[] = ['## Project memory (learned from this project)', '']
  let budget = opts.maxChars
  const push = (line: string): boolean => {
    if (budget - line.length <= 0) return false
    parts.push(line)
    budget -= line.length
    return true
  }

  if (hasPersona) {
    if (persona.stack.length > 0) push(`- Stack: ${persona.stack.join('; ')}`)
    if (persona.conventions.length > 0) push(`- Conventions: ${persona.conventions.join('; ')}`)
    if (persona.painPoints.length > 0) push(`- Known issues: ${persona.painPoints.join('; ')}`)
  }
  if (scenarios.length > 0) {
    push('')
    push(`Learned across ${memory.sessions.length} session(s):`)
    for (const scenario of scenarios) {
      if (!push(`- [${scenario.category}] ${scenario.statement} (seen ${scenario.occurrences}x)`)) break
    }
  }
  return parts.join('\n')
}

/**
 * Enrich a system prompt with the project's distilled memory. Returns the
 * original prompt unchanged when nothing has been learned, so callers keep
 * working with zero memory (mirrors buildWebIntelSystemPrompt).
 */
export function buildMemorySystemPrompt(
  root: string,
  systemPrompt?: string,
  options: MemoryContextOptions = {}
): string | undefined {
  const section = formatMemoryContext(root, options)
  if (!section) return systemPrompt
  if (!systemPrompt) return section
  return `${systemPrompt}\n\n${section}`
}

/**
 * Apply the memory loader when a project root is set; otherwise return the
 * system prompt unchanged. Shared by the local/remote/wasm providers so the
 * enrichment stays in lockstep with skills + intel.
 */
export function enrichWithMemory(
  projectRoot: string | undefined,
  memoryLoader: (root: string, systemPrompt?: string) => string | undefined,
  systemPrompt?: string
): string | undefined {
  if (!projectRoot) return systemPrompt
  return memoryLoader(projectRoot, systemPrompt) ?? systemPrompt
}
