/**
 * MemoryDistiller — L0→L3 agent memory.
 *
 * Locks in the deterministic distillation contract: raw sessions (L0) become
 * deduplicated facts (L1), occurrence-weighted scenario lessons (L2), and an
 * aggregated project persona (L3), persisted under
 * .vectalon/knowledge/memory/distilled.json and inlined into model prompts
 * like web intel.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  MemoryDistiller,
  memoryFilePath,
  buildMemorySystemPrompt,
  enrichWithMemory,
} from '../../src/memory/MemoryDistiller'
import type { MemorySession, Pattern } from '../../src/memory'

function session(overrides: Partial<MemorySession> = {}): MemorySession {
  return {
    id: 's1',
    workflowId: 'feature-development',
    startedAt: 1000,
    endedAt: 2000,
    outcome: 'completed',
    summary: 'add login screen',
    files: ['src/Login.tsx'],
    facts: ['Added zustand for state management', 'Components use PascalCase naming'],
    entries: [{ kind: 'tool', tool: 'code-review', text: '🔴 src/Login.tsx: avoid inline style objects', at: 1500 }],
    ...overrides,
  }
}

describe('MemoryDistiller', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vct-mem-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists distilled memory under .vectalon/knowledge/memory/', () => {
    const distiller = new MemoryDistiller(dir)
    distiller.ingestSession(session())

    expect(existsSync(memoryFilePath(dir))).toBe(true)
    const onDisk = JSON.parse(readFileSync(memoryFilePath(dir), 'utf-8'))
    expect(onDisk.version).toBe(1)
    expect(onDisk.sessions).toHaveLength(1)
    expect(onDisk.sessions[0].id).toBe('s1')
  })

  it('distills L1 facts, dedupes L2 scenarios, and aggregates L3 persona', () => {
    const distiller = new MemoryDistiller(dir)
    distiller.ingestSession(session())
    distiller.ingestSession(session({ id: 's2' })) // same facts again

    const memory = distiller.read()

    // L1: facts extracted from structured facts + 🔴 review findings.
    const statements = memory.facts.map(f => f.statement)
    expect(statements).toContain('Added zustand for state management')
    expect(statements).toContain('Components use PascalCase naming')
    expect(statements.some(s => s.includes('avoid inline style objects'))).toBe(true)

    // L2: identical facts dedupe into one scenario with occurrences = 2.
    const zustand = memory.scenarios.find(s => s.statement === 'Added zustand for state management')
    expect(zustand).toBeDefined()
    expect(zustand!.occurrences).toBe(2)
    expect(zustand!.category).toBe('dependency')

    // L3: persona sections aggregate from scenario knowledge.
    expect(memory.persona.stack).toContain('Added zustand for state management')
    expect(memory.persona.conventions).toContain('Components use PascalCase naming')
    expect(memory.persona.painPoints.some(p => p.includes('avoid inline style objects'))).toBe(true)
  })

  it('bridges existing ProjectMemory patterns into conventions', () => {
    const patterns: Pattern[] = [
      {
        id: 'naming-pascal',
        pattern: 'PascalCase components',
        description: 'Component files use PascalCase naming convention',
        confidence: 0.9,
        occurrences: 3,
        firstSeen: 1000,
        lastSeen: 2000,
        category: 'naming',
        source: 'learner',
      },
    ]
    const distiller = new MemoryDistiller(dir)
    distiller.learnFromPatterns(patterns)
    distiller.learnFromPatterns(patterns) // idempotent — deduped

    const memory = distiller.read()
    const conv = memory.scenarios.find(s => s.category === 'convention')
    expect(conv).toBeDefined()
    expect(conv!.statement).toContain('PascalCase naming convention')
    expect(conv!.occurrences).toBe(1) // dedup across calls
    expect(memory.persona.conventions).toContain(conv!.statement)
  })

  it('buildMemorySystemPrompt appends persona + scenario sections', () => {
    new MemoryDistiller(dir).ingestSession(session())

    const enriched = buildMemorySystemPrompt(dir, 'be concise')!
    expect(enriched).toContain('## Project memory (learned from this project)')
    expect(enriched).toContain('- Stack:')
    expect(enriched).toContain('- Conventions:')
    expect(enriched).toContain('- Known issues:')
    expect(enriched).toContain('(seen 1x)')
    expect(enriched.startsWith('be concise')).toBe(true)
  })

  it('returns the original prompt when nothing has been learned', () => {
    expect(buildMemorySystemPrompt(dir, 'unchanged')).toBe('unchanged')
    expect(buildMemorySystemPrompt(dir)).toBeUndefined()
  })

  it('caps scenario lessons in the prompt', () => {
    const distiller = new MemoryDistiller(dir)
    for (let i = 0; i < 5; i++) {
      distiller.ingestSession(session({ id: `s${i}`, facts: [`Fact number ${i}`] }))
    }
    const enriched = buildMemorySystemPrompt(dir, 'base', { maxScenarios: 2 })!
    const matches = enriched.match(/\(seen 1x\)/g)
    expect(matches ? matches.length : 0).toBeLessThanOrEqual(2)
  })

  it('enrichWithMemory no-ops without a project root', () => {
    expect(enrichWithMemory(undefined, () => 'injected', 'base')).toBe('base')
    expect(enrichWithMemory('/tmp/x', () => undefined, 'base')).toBe('base')
    expect(enrichWithMemory('/tmp/x', (_r, s) => `${s}\n\nM`, 'base')).toBe('base\n\nM')
  })
})
