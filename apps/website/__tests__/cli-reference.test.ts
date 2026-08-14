/**
 * Docs-drift guard: CLI_REFERENCE.md must stay in lockstep with the commands
 * actually registered by the CLI. If a command is added/renamed/removed in
 * packages/rn/src/cli/index.ts and the reference isn't updated to match, this
 * test fails in CI.
 *
 * Parses two sources of truth directly (no cross-package imports, so it runs
 * in the website's plain node jest environment):
 *   - packages/rn/src/cli/index.ts     → the registered command names
 *   - apps/website/docs/CLI_REFERENCE.md → the `## `name`` sections
 */
import * as fs from 'fs'
import * as path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../../..')
const CLI_SOURCE = path.join(REPO_ROOT, 'packages/rn/src/cli/index.ts')
const CLI_REFERENCE = path.join(REPO_ROOT, 'apps/website/docs/CLI_REFERENCE.md')

/** Extract registered subcommand names from `program.command('name ...')` calls. */
function registeredCommands(source: string): string[] {
  const names: string[] = []
  const re = /\.command\(['"]([a-z][a-z0-9-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) names.push(m[1])
  return [...new Set(names)].sort()
}

/** Extract documented `## `name`` section headers from the markdown. */
function documentedSections(markdown: string): string[] {
  const names: string[] = []
  const re = /^## `([a-z0-9-]+)`$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) names.push(m[1])
  return [...new Set(names)].sort()
}

describe('CLI_REFERENCE.md vs the registered CLI commands', () => {
  const source = fs.readFileSync(CLI_SOURCE, 'utf8')
  const markdown = fs.readFileSync(CLI_REFERENCE, 'utf8')
  const commands = registeredCommands(source)
  const sections = documentedSections(markdown)

  it('parses the CLI registrations (sanity check on the parser)', () => {
    expect(commands).toEqual(
      expect.arrayContaining([
        'init',
        'serve',
        'feature',
        'upgrade',
        'bench',
        'visual-ci',
        'ci-incident',
        'visual-baseline',
        'team-policy',
      ])
    )
    expect(commands.length).toBeGreaterThanOrEqual(30)
  })

  it('documents every registered command', () => {
    const missing = commands.filter(c => !sections.includes(c))
    expect(missing).toEqual([])
  })

  it('has no orphan sections for commands that no longer exist', () => {
    const orphans = sections.filter(s => !commands.includes(s))
    expect(orphans).toEqual([])
  })
})
