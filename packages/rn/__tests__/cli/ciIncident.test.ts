import { mkdirSync } from 'fs'
import { join } from 'path'
import { ciIncidentCommand } from '../../src/cli/commands/ciIncident'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { createTempProject, cleanup } from '../helpers/tmp'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: () => ({ allowed: true, currentTier: 'pro', requiredTier: 'pro', canTrial: false }),
}))

describe('ciIncidentCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
    })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('files a triaged incident into the knowledge base', async () => {
    await ciIncidentCommand(dir, { gate: 'quality', branch: 'main', commit: 'abc1234', command: 'yarn lint' })

    // Mirror the command's engine choice so the same store file is read.
    const store = new ArtifactStore(dir)
    const incidents = store.list().filter(a => a.meta.kind === 'ci-gate')
    expect(incidents).toHaveLength(1)
    expect(incidents[0].type).toBe('operations')
    expect(incidents[0].meta.gate).toBe('quality')
    expect(incidents[0].content).toContain('git revert abc1234')
  })

  it('dry run analyzes and prints without persisting', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await ciIncidentCommand(dir, { gate: 'visual-regression', branch: 'feature/login', commit: 'def5678', dryRun: true })

    const store = new ArtifactStore(dir)
    expect(store.list().filter(a => a.meta.kind === 'ci-gate')).toHaveLength(0)
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('CI gate incident'))
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('do not merge'))
  })

  it('prints machine-readable JSON with --json', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await ciIncidentCommand(dir, { gate: 'quality', branch: 'main', commit: 'abc1234', json: true })

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"severity"'))
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"rollback"'))
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"artifactId"'))
  })

  it('warns on a missing telemetry directory but still files the incident', async () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await ciIncidentCommand(dir, { gate: 'quality', branch: 'main', commit: 'abc', telemetry: 'nope' })

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Telemetry directory not found'))
    const store = new ArtifactStore(dir)
    expect(store.list().filter(a => a.meta.kind === 'ci-gate')).toHaveLength(1)
  })
})
