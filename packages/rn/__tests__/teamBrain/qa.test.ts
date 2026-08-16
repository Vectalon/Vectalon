import { parseDecisionCard, buildAreaExpertise, areaOfFile, renderDecisionCard, renderExpertiseTree, tokensOf, decisionMatches, isDecisionQuestion } from '../../src/teamBrain/qa'
import { parseGitAuthors, parseGitFiles } from '../../src/teamBrain/expertise'
import type { DecisionIndexEntry } from '../../src/teamBrain/types'

const ADR = `# ADR-017: Use Zustand for state management

## Status

Accepted March 2026

## Context

Redux adds too much boilerplate for our scale. We need a lightweight store.

## Decision

Use Zustand instead of Redux — performance + simplicity.

## Consequences

Smaller bundles, faster onboarding.

Related ADRs: ADR-003, ADR-012
Approved by: Architecture Team
Related: Checkout, Payments, Profile
`

function entry(): DecisionIndexEntry {
  return { id: 'adr-017', title: 'Use Zustand for state management', status: 'Accepted', path: 'docs/adr/0017-zustand.md' }
}

describe('vc brain — decision cards', () => {
  it('parses the P1 card shape from an ADR', () => {
    const card = parseDecisionCard(entry(), ADR, Date.UTC(2026, 2, 15))
    expect(card.id).toBe('adr-017')
    expect(card.reason).toContain('Use Zustand instead of Redux')
    expect(card.reason).toContain('performance + simplicity')
    expect(card.approvedBy).toEqual(['Architecture Team'])
    expect(card.related).toContain('Checkout')
    expect(card.related).toContain('Payments')
    expect(card.related).toContain('Profile')
    expect(card.reviewed).toBe('March 2026')
    expect(card.status).toBe('Accepted')
  })

  it('falls back to the file mtime for reviewed when no date is present', () => {
    const noDate = ADR.replace('Accepted March 2026', 'Accepted')
    const card = parseDecisionCard(entry(), noDate, Date.UTC(2026, 0, 10))
    expect(card.reviewed).toBe('2026-01')
  })

  it('renders the decision card exactly in the P1 shape', () => {
    const card = parseDecisionCard(entry(), ADR, Date.UTC(2026, 2, 15))
    const lines = renderDecisionCard(card).join('\n')
    expect(lines).toContain('Decision: adr-017 — Use Zustand for state management')
    expect(lines).toContain('Reason:')
    expect(lines).toContain('Approved by: Architecture Team')
    expect(lines).toContain('Related:  Checkout, Payments, Profile')
    expect(lines).toContain('Reviewed: March 2026')
  })
})

describe('vc brain — area expertise', () => {
  it('maps files to functional areas', () => {
    expect(areaOfFile('src/screens/LoginScreen.tsx')).toBe('screens')
    expect(areaOfFile('src/services/AuthApi.ts')).toBe('services')
    expect(areaOfFile('src/state/CartStore.ts')).toBe('state')
    expect(areaOfFile('src/navigation/RootStack.tsx')).toBe('navigation')
    expect(areaOfFile('src/components/Button.tsx')).toBe('components')
    expect(areaOfFile('src/utils/format.ts')).toBe('utils')
    expect(areaOfFile('src/something-odd.js')).toBe('other')
  })

  it('builds the expertise tree with owner, experts, services, changes', () => {
    const log = [
      'abc1234|John|2026-03-01T10:00:00Z|add login',
      'abc1235|John|2026-03-02T10:00:00Z|fix auth',
      'abc1236|Priya|2026-03-03T10:00:00Z|login styles',
      'abc1237|Priya|2026-03-04T10:00:00Z|cart state',
      'abc1238|Team A|2026-03-05T10:00:00Z|payment flow',
    ].join('\n')
    const filesLog = [
      'abc1234',
      'src/screens/LoginScreen.tsx',
      'src/services/AuthApi.ts',
      'abc1235',
      'src/services/AuthApi.ts',
      'src/state/AuthStore.ts',
      'abc1236',
      'src/screens/LoginScreen.tsx',
      'abc1237',
      'src/state/CartStore.ts',
      'abc1238',
      'src/screens/PaymentScreen.tsx',
      'src/services/PaymentApi.ts',
    ].join('\n')
    const commits = parseGitAuthors(log)
    const files = parseGitFiles(filesLog)
    const areas = buildAreaExpertise(commits, files, [])

    const screens = areas.find(a => a.area === 'screens')
    expect(screens).toBeDefined()
    expect(screens!.owner).toBe('John')
    expect(screens!.experts).toContain('Priya')
    expect(screens!.services).toBe(2) // LoginScreen + PaymentScreen
    expect(screens!.recentChanges).toBe(2)

    const services = areas.find(a => a.area === 'services')
    expect(services).toBeDefined()
    expect(services!.owner).toBe('John')
    expect(services!.services).toBe(2) // AuthApi + PaymentApi
  })

  it('renders the expertise tree in the P1 shape', () => {
    const lines = renderExpertiseTree({ area: 'authentication', owner: 'Team A', experts: ['John', 'Priya'], adrs: 3, services: 7, recentChanges: 14 }).join('\n')
    expect(lines).toContain('authentication — Owner: Team A · Experts: John, Priya')
    expect(lines).toContain('ADRs: 3')
    expect(lines).toContain('Services: 7')
    expect(lines).toContain('Recent changes: 14')
  })
})

describe('vc brain — question matching', () => {
  it('tokenizes questions and drops stopwords', () => {
    expect(tokensOf('Why are we using Zustand instead of Redux?')).toContain('zustand')
    expect(tokensOf('Who understands our authentication architecture?')).toContain('authentication')
    // Stopwords carry no signal — and 'the' must not match inside 'other'.
    expect(tokensOf('Who understands the screens?')).toEqual(['understands', 'screens'])
    expect(tokensOf('the and for with')).toEqual([])
  })

  it('classifies decision questions', () => {
    expect(isDecisionQuestion('Why are we using Zustand instead of Redux?')).toBe(true)
    expect(isDecisionQuestion('Which state library do we use?')).toBe(true)
    expect(isDecisionQuestion('What is the ADR for state?')).toBe(true)
    expect(isDecisionQuestion('Who understands our authentication architecture?')).toBe(false)
  })

  it('matches a decision card by token overlap', () => {
    const card = parseDecisionCard(entry(), ADR, Date.UTC(2026, 2, 15))
    const tokens = tokensOf('Why are we using Zustand instead of Redux?')
    expect(decisionMatches(card, tokens)).toBeGreaterThan(0)
  })
})
