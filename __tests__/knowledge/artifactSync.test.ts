import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createTempProject, cleanup } from '../helpers/tmp'
import {
  ArtifactSync,
  readSyncConfig,
  writeSyncConfig,
  createArtifactSync,
  DEFAULT_SYNC_BRANCH,
  syncConfigPath,
} from '../../src/knowledge/artifactSync'
import type { CommandResult } from '../../src/adapters/runCommand'

function ok(stdout = ''): CommandResult {
  return { success: true, stdout, stderr: '', exitCode: 0 }
}

function fail(stderr: string): CommandResult {
  return { success: false, stdout: '', stderr, exitCode: 1 }
}

describe('artifactSync config', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('returns null without a config file', () => {
    expect(readSyncConfig(dir)).toBeNull()
  })

  it('writes and reads a config with default branch', () => {
    const path = writeSyncConfig(dir, { remote: 'git@github.com:org/brain.git', branch: DEFAULT_SYNC_BRANCH, enabled: true })
    expect(path).toBe(syncConfigPath(dir))
    expect(existsSync(path)).toBe(true)
    expect(readSyncConfig(dir)).toEqual({
      remote: 'git@github.com:org/brain.git',
      branch: 'main',
      enabled: true,
    })
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    expect(raw.remote).toBe('git@github.com:org/brain.git')
  })

  it('rejects configs without a remote and tolerates garbage', () => {
    writeSyncConfig(dir, { remote: '', branch: 'main', enabled: true })
    expect(readSyncConfig(dir)).toBeNull()

    writeFileSync(syncConfigPath(dir), 'not json{{')
    expect(readSyncConfig(dir)).toBeNull()
  })
})

describe('ArtifactSync', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('push runs add, commit, remote-add, and push commands', async () => {
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      if (command === 'git' && args[0] === 'remote') return ok('origin\n')
      // Staged changes exist: exit 1 so the commit branch actually runs.
      if (command === 'git' && args[0] === 'diff') return { success: false, stdout: '', stderr: '', exitCode: 1 }
      return ok()
    }
    const sync = new ArtifactSync(dir, { remote: 'git@example.com:b.git', branch: 'main', enabled: true }, executor)

    const result = await sync.push()

    expect(result.pushed).toBe(true)
    expect(result.message).toContain('git@example.com:b.git@main')
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat).toContain('add .vectalon/knowledge')
    expect(flat.some(a => a.startsWith('commit -m sync:'))).toBe(true)
    expect(flat).toContain('remote add vectalon-sync git@example.com:b.git')
    expect(flat).toContain('push -u vectalon-sync HEAD:main')
    expect(result.committed).toBeDefined()
  })

  it('push skips the commit when nothing changed', async () => {
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      return ok()
    }
    const sync = new ArtifactSync(dir, { remote: 'git@example.com:b.git', branch: 'main' }, executor)
    const result = await sync.push()

    expect(result.pushed).toBe(true)
    expect(result.message).toContain('already up to date')
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat.some(a => a.startsWith('commit'))).toBe(false)
    expect(flat).toContain('push -u vectalon-sync HEAD:main')
  })

  it('push reports failures', async () => {
    const executor = async (command: string, args: string[]): Promise<CommandResult> =>
      command === 'git' && args[0] === 'add' ? fail('permission denied') : ok()
    const sync = new ArtifactSync(dir, { remote: 'r', branch: 'main' }, executor)
    const result = await sync.push()
    expect(result.pushed).toBe(false)
    expect(result.message).toContain('permission denied')
  })

  it('pull runs fetch and checkout of the knowledge dir', async () => {
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      return ok()
    }
    const sync = new ArtifactSync(dir, { remote: 'git@example.com:b.git', branch: 'main' }, executor)
    const result = await sync.pull()

    expect(result.pulled).toBe(true)
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat).toContain('fetch git@example.com:b.git main')
    expect(flat).toContain('checkout FETCH_HEAD -- .vectalon/knowledge')
  })

  it('refuses to run when disabled without force', async () => {
    const executor = jest.fn(async () => ok())
    const sync = new ArtifactSync(dir, { remote: 'r', branch: 'main', enabled: false }, executor)
    await expect(sync.push()).rejects.toThrow(/disabled/)
    await expect(sync.pull()).rejects.toThrow(/disabled/)
    expect(executor).not.toHaveBeenCalled()
  })

  it('createArtifactSync returns null without config', () => {
    expect(createArtifactSync(dir)).toBeNull()
  })

  it('createArtifactSync honors CLI overrides', () => {
    writeSyncConfig(dir, { remote: 'git@example.com:b.git', branch: 'main', enabled: true })
    const sync = createArtifactSync(dir, { remote: 'git@example.com:c.git', branch: 'dev' })
    expect(sync).not.toBeNull()
    const result = sync!.push({ remote: 'git@example.com:c.git', branch: 'dev', executor: async () => ok() })
    expect(result).toBeDefined()
  })
})
