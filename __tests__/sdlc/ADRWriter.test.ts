import { ADRWriter } from '../../src/sdlc/ADRWriter'

describe('ADRWriter', () => {
  it('writes an ADR scaffold with all standard sections', () => {
    const adr = new ADRWriter().writeADR({ title: 'Use TypeScript', context: 'The codebase is untyped' })
    expect(adr).toContain('# ADR-1: Use TypeScript')
    expect(adr).toContain('Status: proposed')
    expect(adr).toContain('## Context')
    expect(adr).toContain('The codebase is untyped')
    expect(adr).toContain('## Decision')
    expect(adr).toContain('## Options Considered')
    expect(adr).toContain('## Consequences')
  })

  it('lists the options and chosen decision', () => {
    const adr = new ADRWriter().writeADR({
      title: 'State management',
      context: 'We need to pick a store',
      options: ['Redux', 'Zustand', 'Context'],
      decision: 'Zustand',
    })
    expect(adr).toContain('- Redux')
    expect(adr).toContain('- Zustand')
    expect(adr).toContain('- Context')
    expect(adr).toContain('Zustand')
  })

  it('honours a custom ADR number', () => {
    const adr = new ADRWriter().writeADR({ title: 'API client', context: 'c', number: 7 })
    expect(adr).toContain('# ADR-7: API client')
  })
})
