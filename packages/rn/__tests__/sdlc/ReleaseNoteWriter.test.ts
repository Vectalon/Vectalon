import { ReleaseNoteWriter } from '../../src/sdlc/ReleaseNoteWriter'

describe('ReleaseNoteWriter', () => {
  it('categorizes changes into canonical sections', () => {
    const notes = new ReleaseNoteWriter().writeReleaseNotes({
      version: '1.2.0',
      changes: ['Add camera onboarding', 'Fix login crash', 'Upgrade to React Native 0.74'],
    })
    expect(notes).toContain('# Release Notes — v1.2.0')
    expect(notes).toContain('## Added')
    expect(notes).toContain('- Add camera onboarding')
    expect(notes).toContain('## Fixed')
    expect(notes).toContain('- Fix login crash')
    expect(notes).toContain('## Changed')
    expect(notes).toContain('React Native 0.74')
  })

  it('routes security and performance keywords first', () => {
    const notes = new ReleaseNoteWriter().writeReleaseNotes({
      version: '1.3.0',
      changes: ['Fix a security vulnerability in auth', 'Speed up app startup'],
    })
    expect(notes).toContain('## Security')
    expect(notes).toContain('## Performance')
    expect(notes).not.toContain('## Fixed')
  })

  it('sends unrecognised changes to an Other section', () => {
    const notes = new ReleaseNoteWriter().writeReleaseNotes({ version: '1.0.0', changes: ['Misc housekeeping'] })
    expect(notes).toContain('## Other')
    expect(notes).toContain('Misc housekeeping')
  })

  it('uses an explicit release date when provided', () => {
    const notes = new ReleaseNoteWriter().writeReleaseNotes({
      version: '1.0.0',
      date: '2026-01-15',
      changes: [],
    })
    expect(notes).toContain('Release date: 2026-01-15')
  })
})
