import { ReleaseNoteWriter } from './ReleaseNoteWriter'

/**
 * Autonomous release planning — Phase II-2.
 *
 * `vectalon release` detects the version bump from git history, generates the
 * changelog from commits, and produces a full release plan (submit + monitor
 * stages). Fully deterministic — no model calls.
 */

export type BumpType = 'major' | 'minor' | 'patch' | 'none'

export interface ParsedCommit {
  hash: string
  message: string
  /** Lower-cased message for keyword matching. */
  lower: string
}

export interface ReleasePlan {
  currentVersion: string
  nextVersion: string
  bump: BumpType
  /** Commit messages that feed the changelog (PR titles, conventional commits). */
  changes: string[]
  changelog: string
  releaseDate: string
  commits: ParsedCommit[]
}

const BUMP_RULES: [BumpType, string[]][] = [
  ['major', ['breaking change', 'breaking-change', 'feat!', 'fix!', 'major']],
  ['minor', ['feat', 'feature', 'add ', 'new ', 'introduce', 'support for']],
  ['patch', ['fix', 'bug', 'patch', 'resolve', 'repair', 'revert', 'chore', 'refactor', 'docs', 'perf', 'style', 'test', 'build', 'ci']],
]

/** Parse `git log --oneline` output into structured commits. */
export function parseGitLog(logOutput: string): ParsedCommit[] {
  const commits: ParsedCommit[] = []
  for (const line of logOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Lines that are not `hash message` (e.g. the "Merge branch" wrapping or
    // a bare URL) are skipped when they carry no message.
    const match = trimmed.match(/^([0-9a-f]{7,40})\s+(.*)$/)
    if (match) {
      const [, hash, message] = match
      if (message.trim()) {
        commits.push({ hash, message: message.trim(), lower: message.trim().toLowerCase() })
      }
    } else if (trimmed.length > 0) {
      // Un-hashed line (e.g. `* feat: ...` from a PR list) — treat the whole
      // line as the message.
      commits.push({ hash: '', message: trimmed, lower: trimmed.toLowerCase() })
    }
  }
  return commits
}

/** Detect the semver bump from commit messages (major > minor > patch). */
export function detectBumpType(commits: ParsedCommit[]): BumpType {
  if (commits.length === 0) return 'none'
  for (const commit of commits) {
    const lower = commit.lower
    // Breaking changes win immediately.
    if (BUMP_RULES[0][1].some(keyword => lower.includes(keyword))) return 'major'
    if (BUMP_RULES[1][1].some(keyword => lower.includes(keyword))) return 'minor'
  }
  // Patch-level keywords, or no keywords matched at all → default to patch.
  return 'patch'
}

/** Increment a semver string. Falls back to 0.1.0 for unparseable versions. */
export function bumpVersion(current: string, bump: BumpType): string {
  const parts = current.split('.').map(n => parseInt(n, 10))
  const [major = 0, minor = 0, patch = 0] = parts
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    case 'none':
      return current
  }
}

/**
 * Build a release plan from the current version and git history. The changelog
 * is generated from commit messages via the same deterministic categorizer the
 * `write_release_notes` tool uses.
 */
export function planRelease(currentVersion: string, logOutput: string, date = new Date().toISOString().slice(0, 10)): ReleasePlan {
  const commits = parseGitLog(logOutput)
  const bump = detectBumpType(commits)
  const nextVersion = bumpVersion(currentVersion, bump)
  const changes = commits.map(c => c.message)
  const changelog = new ReleaseNoteWriter().writeReleaseNotes({
    version: nextVersion,
    date,
    changes,
  })
  return { currentVersion, nextVersion, bump, changes, changelog, releaseDate: date, commits }
}

/** Render the release plan as a markdown report (changelog included). */
export function renderReleasePlan(plan: ReleasePlan): string {
  const lines: string[] = []
  lines.push('## 🚀 Release plan')
  lines.push('')
  lines.push(`**Version:** ${plan.currentVersion} → **${plan.nextVersion}** (${plan.bump === 'none' ? 'no change detected' : `${plan.bump} bump`})`)
  lines.push(`**Commits since last release:** ${plan.commits.length}`)
  lines.push('')
  lines.push('### Changelog')
  lines.push('')
  lines.push(plan.changelog)
  lines.push('')
  lines.push('### Next stages')
  lines.push('')
  lines.push('- **E2E on device farm** — `vectalon release --submit` writes the EAS / GitHub Actions release workflow (Maestro E2E + store submission)')
  lines.push('- **Submit to stores** — App Store Connect / Play Console via the generated workflow')
  lines.push('- **Monitor 24h** — `vectalon release --monitor --telemetry <dir>` ingests Crashlytics exports and files an incident with a rollback suggestion if the crash rate spikes')
  return lines.join('\n')
}
