import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { runReleaseReady, writeReleaseReadyReport, renderReleaseReadyMarkdown, verdictOf, releaseReadyDocsDir } from '../../src/releaseReady'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { ReleaseCheck } from '../../src/releaseReady/types'

describe('release-ready: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    const check = (severity: ReleaseCheck['severity']): ReleaseCheck =>
      ({ id: 'x', severity, title: 't', message: 'm' })
    expect(verdictOf([check('error')])).toBe('changes-requested')
    expect(verdictOf([check('warning')])).toBe('needs-attention')
    expect(verdictOf([check('info')])).toBe('approved')
    expect(verdictOf([])).toBe('approved')
  })
})

describe('release-ready: runReleaseReady', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('warns when the version is not in the changelog and no lockfile exists', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/index.ts': 'export const ok = true\n',
    })
    const report = await runReleaseReady(dir)
    expect(report.version).toBe('1.0.0')
    expect(report.lastTag).toBe('') // not a git repo — degrades gracefully
    expect(report.checks.some(c => c.id === 'changelog' && c.severity === 'warning')).toBe(true)
    expect(report.checks.some(c => c.id === 'lockfile' && c.severity === 'warning')).toBe(true)
    expect(report.checks.some(c => c.id === 'env-hygiene' && c.severity === 'info')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('reports a version behind the last tag as an error (real git repo)', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'src/index.ts': 'export const ok = true\n',
    })
    // Make it a real repo with a newer tag than the declared version.
    const { runCommand } = await import('../../src/adapters/runCommand')
    await runCommand('git', ['init', '-q'], { cwd: dir })
    await runCommand('git', ['add', '-A'], { cwd: dir })
    await runCommand('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dir })
    await runCommand('git', ['tag', 'v1.1.0'], { cwd: dir })
    const report = await runReleaseReady(dir)
    expect(report.lastTag).toBe('v1.1.0')
    const versionCheck = report.checks.find(c => c.id === 'version')
    expect(versionCheck).toBeDefined()
    expect(versionCheck!.severity).toBe('error')
    expect(versionCheck!.fix).toContain('Bump the version')
    expect(report.verdict).toBe('changes-requested')
  })

  it('approves a fully ready project', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', scripts: { test: 'jest' } }),
      'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-08-14\n\nInitial release.\n',
      'package-lock.json': '{}',
      '.github/workflows/ci.yml': 'name: CI\non: push\n',
      'src/index.ts': 'export const ok = true\n',
    })
    const { runCommand } = await import('../../src/adapters/runCommand')
    await runCommand('git', ['init', '-q'], { cwd: dir })
    await runCommand('git', ['add', '-A'], { cwd: dir })
    await runCommand('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dir })
    await runCommand('git', ['tag', 'v0.9.0'], { cwd: dir })
    const report = await runReleaseReady(dir)
    expect(report.checks.find(c => c.id === 'version')!.severity).toBe('info')
    expect(report.checks.find(c => c.id === 'changelog')!.severity).toBe('info')
    expect(report.checks.find(c => c.id === 'lockfile')!.severity).toBe('info')
    expect(report.checks.find(c => c.id === 'ci')!.severity).toBe('info')
    expect(report.checks.find(c => c.id === 'tests')!.severity).toBe('info')
    expect(report.verdict).toBe('approved')
  })
})

describe('release-ready: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/release-ready/', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-08-14\n\nInitial release.\n',
      'src/index.ts': 'export const ok = true\n',
    })
    const report = await runReleaseReady(dir)
    const { jsonPath, mdPath } = writeReleaseReadyReport(dir, report)
    expect(jsonPath).toBe(join(releaseReadyDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(releaseReadyDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    expect(JSON.parse(readFileSync(jsonPath, 'utf-8')).version).toBe('1.0.0')
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon release-ready — Release Readiness')
    expect(md).toContain('## Checklist')
  })

  it('renders the ship-it verdict for an approved report', async () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', scripts: { test: 'jest' } }),
      'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-08-14\n\nInitial release.\n',
      'package-lock.json': '{}',
      '.github/workflows/ci.yml': 'name: CI\non: push\n',
      'src/index.ts': 'export const ok = true\n',
    })
    const { runCommand } = await import('../../src/adapters/runCommand')
    await runCommand('git', ['init', '-q'], { cwd: dir })
    await runCommand('git', ['add', '-A'], { cwd: dir })
    await runCommand('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dir })
    await runCommand('git', ['tag', 'v0.9.0'], { cwd: dir })
    const md = renderReleaseReadyMarkdown(await runReleaseReady(dir))
    expect(md).toContain('**Ship it.**')
  })
})
