/**
 * vectalon repos — Multi-repository Memory Agent (Roadmap 085) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { parseReposManifest, runReposScan, readReposManifest, writeReposReport } from '../../src/repos'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('repos: parseReposManifest', () => {
  it('parses manifest entries', () => {
    const manifest = parseReposManifest(JSON.stringify({ version: 1, repos: [{ name: 'app', path: '../app', memory: true }] }))
    expect(manifest.repos).toHaveLength(1)
    expect(manifest.repos[0].name).toBe('app')
    expect(manifest.repos[0].memory).toBe(true)
  })

  it('is tolerant of corrupt manifests', () => {
    expect(parseReposManifest('not json').repos).toHaveLength(0)
  })
})

describe('repos: runReposScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags missing, non-git, and memory-less sibling repos', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/repos.json': JSON.stringify({ repos: [
        { name: 'good', path: 'sibling-good' },
        { name: 'missing', path: 'sibling-missing' },
        { name: 'notgit', path: 'sibling-notgit' },
      ] }),
      'sibling-good/.git/config': '[core]\n',
      'sibling-good/.vectalon/memory/index.json': '{}',
      'sibling-notgit/README.md': 'plain dir',
    })
    const report = runReposScan(dir)
    expect(report.repoCount).toBe(3)
    const good = report.checks.find(c => c.name === 'good')
    expect(good?.status).toBe('ok')
    expect(report.checks.find(c => c.name === 'missing')?.status).toBe('missing')
    expect(report.checks.find(c => c.name === 'notgit')?.status).toBe('not-git')
    expect(report.findings.some(f => f.id === 'missing-repo')).toBe(true)
    expect(report.findings.some(f => f.id === 'not-git')).toBe(true)
    expect(report.verdict).toBe('needs-attention')
  })

  it('reports when no manifest exists', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runReposScan(dir)
    expect(readReposManifest(dir).path).toBeNull()
    expect(report.findings.some(f => f.id === 'no-manifest')).toBe(true)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runReposScan(dir)
    const { mdPath, jsonPath } = writeReposReport(dir, report)
    expect(mdPath).toContain('repos')
    expect(jsonPath).toContain('report.json')
  })
})
