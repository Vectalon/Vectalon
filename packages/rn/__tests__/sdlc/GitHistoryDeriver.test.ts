import {
  deriveFromGitHistory,
  parseCommitHistory,
  renderGitDerivation,
  isBreaking,
  stripCommitPrefix,
} from '../../src/sdlc/GitHistoryDeriver'

describe('parseCommitHistory', () => {
  it('parses oneline git log output', () => {
    const commits = parseCommitHistory('a1b2c3d feat: add login screen\nf1e2d3c fix: crash on startup\n')
    expect(commits).toEqual([
      { hash: 'a1b2c3d', message: 'feat: add login screen' },
      { hash: 'f1e2d3c', message: 'fix: crash on startup' },
    ])
  })

  it('parses the extended %h|%an|%ai|%s format with author and date', () => {
    const commits = parseCommitHistory(
      'a1b2c3d|Jane Doe|2026-08-06 10:00:00 +0000|feat: add login screen\nf1e2d3c|Bob Smith|2026-08-05 09:30:00 +0000|fix: crash on startup\n'
    )
    expect(commits[0]).toEqual({
      hash: 'a1b2c3d',
      author: 'Jane Doe',
      date: '2026-08-06',
      message: 'feat: add login screen',
    })
    expect(commits[1].author).toBe('Bob Smith')
    expect(commits[1].date).toBe('2026-08-05')
  })

  it('returns an empty list for empty or whitespace-only input', () => {
    expect(parseCommitHistory('')).toEqual([])
    expect(parseCommitHistory('\n   \n')).toEqual([])
  })

  it('skips extended lines with an empty message', () => {
    const commits = parseCommitHistory('a1b2c3d|Jane Doe|2026-08-06 10:00:00 +0000|\nf1e2d3c|Bob|2026-08-05 09:00:00 +0000|fix: crash\n')
    expect(commits).toEqual([{ hash: 'f1e2d3c', author: 'Bob', date: '2026-08-05', message: 'fix: crash' }])
  })
})

describe('isBreaking', () => {
  it('detects conventional-commit breaking markers', () => {
    expect(isBreaking('feat!: add auth')).toBe(true)
    expect(isBreaking('fix! remove v1 API')).toBe(true)
    expect(isBreaking('chore!: drop node 18 support')).toBe(true)
  })

  it('detects the BREAKING CHANGE trailer', () => {
    expect(isBreaking('feat: new auth\n\nBREAKING CHANGE: old tokens invalid')).toBe(true)
    expect(isBreaking('feat: new auth BREAKING CHANGE')).toBe(true)
  })

  it('returns false for ordinary commits', () => {
    expect(isBreaking('feat: add login screen')).toBe(false)
    expect(isBreaking('fix: crash')).toBe(false)
  })
})

describe('stripCommitPrefix', () => {
  it('strips conventional-commit prefixes', () => {
    expect(stripCommitPrefix('feat: add login')).toBe('add login')
    expect(stripCommitPrefix('feat(auth)!: add SSO')).toBe('add SSO')
    expect(stripCommitPrefix('fix: crash on startup')).toBe('crash on startup')
    expect(stripCommitPrefix('plain message')).toBe('plain message')
  })
})

describe('deriveFromGitHistory', () => {
  it('groups changelog entries by category with hashes', () => {
    const derivation = deriveFromGitHistory('a1b2c3d feat: add login screen\nf1e2d3c fix: crash on startup')
    expect(derivation.changelog).toContain('## Added')
    expect(derivation.changelog).toContain('- [`a1b2c3d`] feat: add login screen')
    expect(derivation.changelog).toContain('## Fixed')
    expect(derivation.changelog).toContain('- [`f1e2d3c`] fix: crash on startup')
  })

  it('flags breaking commits in the changelog', () => {
    const derivation = deriveFromGitHistory('a1b2c3d feat!: migrate to TurboModules')
    expect(derivation.changelog).toContain('⚠️ **BREAKING**')
    expect(derivation.stats.breaking).toBe(1)
  })

  it('renders release notes through ReleaseNoteWriter', () => {
    const derivation = deriveFromGitHistory('a1b2c3d feat: add login screen\nf1e2d3c fix: crash on startup')
    expect(derivation.releaseNotes).toContain('# Release Notes — vunreleased')
    expect(derivation.releaseNotes).toContain('## Added')
    expect(derivation.releaseNotes).toContain('## Fixed')
  })

  it('computes the version bump when a current version is given', () => {
    const derivation = deriveFromGitHistory('a1b2c3d feat: add login screen', { currentVersion: '1.2.3' })
    expect(derivation.bump).toBe('minor')
    expect(derivation.nextVersion).toBe('1.3.0')
    expect(derivation.releaseNotes).toContain('# Release Notes — v1.3.0')

    const patch = deriveFromGitHistory('a1b2c3d fix: crash', { currentVersion: '1.2.3' })
    expect(patch.bump).toBe('patch')
    expect(patch.nextVersion).toBe('1.2.4')
  })

  it('derives ADR drafts from decision-worthy commits', () => {
    const derivation = deriveFromGitHistory(
      'a1b2c3d feat: migrate auth to react-native-keychain\nf1e2d3c fix: typo in settings\nb0b0b0b docs: adopt Expo Router v4'
    )
    expect(derivation.adrs.length).toBe(2)
    const keychain = derivation.adrs.find(a => a.commitHash === 'a1b2c3d')
    expect(keychain).toBeDefined()
    expect(keychain!.title).toContain('migrate auth')
    expect(keychain!.content).toContain('# ADR-1: migrate auth')
    expect(keychain!.content).toContain('Status: proposed')
  })

  it('respects the maxAdrs cap', () => {
    const derivation = deriveFromGitHistory(
      'a1b2c3d feat: migrate auth\nf1e2d3c docs: adopt new router\nc0ffee0 refactor: replace legacy bridge',
      { maxAdrs: 1 }
    )
    expect(derivation.adrs.length).toBe(1)
  })

  it('aggregates author, date-range, and category stats from extended logs', () => {
    const derivation = deriveFromGitHistory(
      'a1b2c3d|Jane Doe|2026-08-06 10:00:00 +0000|feat: add login\nf1e2d3c|Jane Doe|2026-08-05 09:00:00 +0000|fix: crash\nb0b0b0b|Bob|2026-08-04 08:00:00 +0000|chore: bump deps'
    )
    expect(derivation.stats.total).toBe(3)
    expect(derivation.stats.authors).toEqual(['Jane Doe', 'Bob'])
    expect(derivation.stats.dateRange).toEqual({ from: '2026-08-04', to: '2026-08-06' })
    expect(derivation.stats.categories.added).toBe(1)
    expect(derivation.stats.categories.fixed).toBe(1)
    expect(derivation.stats.categories.changed).toBe(1)
  })

  it('handles empty input gracefully', () => {
    const derivation = deriveFromGitHistory('')
    expect(derivation.commits).toEqual([])
    expect(derivation.changelog).toBe('# Changelog')
    expect(derivation.stats.total).toBe(0)
    expect(derivation.adrs).toEqual([])
  })
})

describe('renderGitDerivation', () => {
  it('renders a combined markdown report', () => {
    const derivation = deriveFromGitHistory('a1b2c3d feat: add login screen', { currentVersion: '0.9.0' })
    const report = renderGitDerivation(derivation)
    expect(report).toContain('## 📜 Derived from git history')
    expect(report).toContain('**Commits analyzed:** 1')
    expect(report).toContain('0.9.0 → 0.10.0')
    expect(report).toContain('# Changelog')
    expect(report).toContain('# Release Notes — v0.10.0')
  })
})
