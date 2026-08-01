import { detectIntent, intentTitle } from '../../src/workflows/phases/intent'

describe('detectIntent', () => {
  it('classifies remove unused imports as refactor', () => {
    const intent = detectIntent('remove unused imports throughout the app')
    expect(intent.type).toBe('refactor')
    expect((intent as { target: string }).target).toBe('remove-unused-imports')
  })

  it('classifies clean up unused imports as refactor', () => {
    const intent = detectIntent('clean up all unused imports')
    expect(intent.type).toBe('refactor')
    expect((intent as { target: string }).target).toBe('remove-unused-imports')
  })

  it('classifies dependency removal requests correctly', () => {
    const intent = detectIntent('remove appcenter from the project')
    expect(intent.type).toBe('remove-dependency')
    expect((intent as { dependency: string }).dependency).toBe('appcenter')
  })

  it('classifies feature requests correctly', () => {
    const intent = detectIntent('create a login screen')
    expect(intent.type).toBe('add-feature')
    expect((intent as { feature: string }).feature).toBe('login screen')
  })

  it('classifies generic refactor requests correctly', () => {
    const intent = detectIntent('refactor the ProfileScreen component')
    expect(intent.type).toBe('refactor')
    expect((intent as { target: string }).target).toBe('profilescreen')
  })

  it('returns unknown for unsupported prompts', () => {
    const intent = detectIntent('???')
    expect(intent.type).toBe('unknown')
  })
})

describe('intentTitle', () => {
  it('renders refactor title', () => {
    expect(intentTitle({ type: 'refactor', target: 'profilescreen', description: '' })).toBe(
      'Refactor: profilescreen'
    )
  })
})
