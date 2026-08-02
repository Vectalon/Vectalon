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

  it('classifies fix all lint issues as a fix intent', () => {
    const intent = detectIntent('fix all lint issues')
    expect(intent.type).toBe('fix')
    expect((intent as { area: string }).area).toBe('lint')
  })

  it('classifies eslint repair requests as a fix intent', () => {
    const intent = detectIntent('please fix the eslint errors in the project')
    expect(intent.type).toBe('fix')
    expect((intent as { area: string }).area).toBe('lint')
  })

  it('classifies type error fixes as a fix intent', () => {
    const intent = detectIntent('resolve the type errors in the app')
    expect(intent.type).toBe('fix')
    expect((intent as { area: string }).area).toBe('types')
  })

  it('classifies failing test fixes as a fix intent', () => {
    const intent = detectIntent('fix the failing tests')
    expect(intent.type).toBe('fix')
    expect((intent as { area: string }).area).toBe('tests')
  })

  it('classifies generic fix requests as a fix intent', () => {
    const intent = detectIntent('fix the login screen bug')
    expect(intent.type).toBe('fix')
    expect((intent as { area: string }).area).toBe('code')
  })

  it('classifies goal-style repair requests as a fix intent', () => {
    expect(detectIntent('make lint pass').type).toBe('fix')
    expect((detectIntent('make lint pass') as { area: string }).area).toBe('lint')
    expect((detectIntent('get the tests passing') as { area: string }).area).toBe('tests')
    expect((detectIntent('get typecheck green') as { area: string }).area).toBe('types')
  })

  it('classifies clean-up repair phrasings as fix, not dependency removal', () => {
    expect(detectIntent('clean up the lint errors').type).toBe('fix')
    expect((detectIntent('remove the type errors') as { area: string }).area).toBe('types')
    expect((detectIntent('get rid of the lint warnings') as { area: string }).area).toBe('lint')
    // Multiple qualifiers are handled: "clean up all the lint errors"
    expect((detectIntent('clean up all the lint errors') as { area: string }).area).toBe('lint')
    expect((detectIntent('get all the tests passing') as { area: string }).area).toBe('tests')
    // Real dependency removal is unaffected
    expect(detectIntent('remove appcenter from the project').type).toBe('remove-dependency')
  })

  it('does not hijack explicit feature requests', () => {
    const intent = detectIntent('create a login screen')
    expect(intent.type).toBe('add-feature')
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

  it('renders fix title', () => {
    expect(intentTitle({ type: 'fix', area: 'lint', description: '' })).toBe('Fix lint issues')
  })
})
