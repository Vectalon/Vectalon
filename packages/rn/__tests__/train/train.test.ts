/**
 * vectalon train — Release Train Automation (Roadmap 098) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runTrain, workspaceMembers, planRepo, suggestBump } from '../../src/train'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('train: workspaceMembers', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('discovers workspace packages from array and object forms', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/a/package.json': '{}',
      'packages/b/package.json': '{}',
    })
    const members = workspaceMembers(dir)
    expect(members).toContain('.')
    expect(members).toContain('packages/a')
    expect(members).toContain('packages/b')
  })

  it('always includes the root', () => {
    dir = createTempProject({ 'package.json': '{}' })
    expect(workspaceMembers(dir)).toEqual(['.'])
  })
})

describe('train: suggestBump outside git', () => {
  it('reports unknown when git is unavailable', () => {
    const dir = createTempProject({ 'package.json': '{}' })
    expect(suggestBump(dir)).toBe('unknown')
    cleanup(dir)
  })
})

describe('train: planRepo', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('plans a repo with a version but a missing changelog section', () => {
    dir = createTempProject({ 'package.json': JSON.stringify({ name: 'app', version: '1.2.3' }) })
    const plan = planRepo(dir, '.', '')
    expect(plan.name).toBe('app')
    expect(plan.version).toBe('1.2.3')
    expect(plan.changelogSection).toBe(false)
    expect(plan.checks.some(c => c.id === 'changelog')).toBe(true)
    // Outside git: no tags, no dirty state
    expect(plan.dirty).toBe(false)
  })

  it('marks a changelog section present when it matches the version', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ version: '1.2.3' }),
      'CHANGELOG.md': '# Changelog\n\n## [1.2.3] - 2026-08-01\n',
    })
    expect(planRepo(dir, '.', '').changelogSection).toBe(true)
  })
})

describe('train: runTrain', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('reports a changes-requested verdict when a member is missing a changelog section', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'root', version: '2.0.0', workspaces: ['packages/*'] }),
      'packages/a/package.json': JSON.stringify({ name: 'a', version: '0.1.0' }),
      'packages/a/CHANGELOG.md': '# Changelog\n\n## [0.1.0] - 2026-08-01\n',
    })
    const report = runTrain(dir)
    expect(report.repos.length).toBe(2)
    // package a is release-ready; root lacks a changelog section
    const a = report.repos.find(r => r.name === 'a')
    expect(a?.changelogSection).toBe(true)
    expect(report.verdict).toBe('changes-requested')
  })
})
