import { buildImplementationPrompt } from '../../src/workflows/phases/implementationPhase'

const context = {
  snapshot: null,
  prompt: 'Extend the existing useCart hook in src/hooks/useCart.tsx',
  intent: { type: 'add-feature' as const, feature: 'quantity', description: 'extend existing cart' },
}

describe('implementation prompt contract', () => {
  it('shows the JSON newline escape rather than an actual newline', () => {
    const { systemPrompt } = buildImplementationPrompt(context)
    expect(systemPrompt).toContain('escaped newlines (\\n)')
    expect(systemPrompt).not.toContain('escaped newlines (\n)')
  })

  it('does not invent tests, native directories or request-derived module names', () => {
    const { systemPrompt, prompt } = buildImplementationPrompt(context)
    expect(systemPrompt).not.toContain('Tests have already been written')
    expect(systemPrompt).not.toContain('The project has ios/ and android/ directories')
    expect(prompt).not.toContain('suggested base name')
    expect(prompt).toContain(context.prompt)
    expect(prompt).toContain('Preserve required file paths and exported symbols.')
  })

  it('retains supplied test contracts and failure feedback', () => {
    const { prompt } = buildImplementationPrompt({ ...context, tests: 'SUPPLIED_TEST_CONTRACT', lastFailure: 'COMPILER_FAILURE' })
    expect(prompt).toContain('SUPPLIED_TEST_CONTRACT')
    expect(prompt).toContain('COMPILER_FAILURE')
  })
})
