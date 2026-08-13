import { existsSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { writeSyncConfig } from '../../src/knowledge/artifactSync'
import { OrgPolicySync, createOrgPolicySync, ORG_POLICY_REMOTE_PATH } from '../../src/knowledge/orgPolicySync'
import { readOrgPolicyCache, orgPolicyCachePath } from '../../src/knowledge/orgPolicy'
import type { CommandResult } from '../../src/adapters/runCommand'
import type { OrgPolicyDoc } from '../../src/knowledge/orgPolicy'

function ok(stdout = ''): CommandResult {
  return { success: true, stdout, stderr: '', exitCode: 0 }
}

function fail(stderr: string): CommandResult {
  return { success: false, stdout: '', stderr, exitCode: 1 }
}

const doc: OrgPolicyDoc = {
  version: 1,
  policy: { version: 1, rules: { 'no-console-log': { enabled: false } }, customRules: [], codeReview: {} },
  budgets: { largeLibBytes: 65536 },
  updatedAt: '2026-08-13T00:00:00.000Z',
}

describe('OrgPolicySync', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
    writeSyncConfig(dir, { remote: 'git@example.com:org/brain.git', branch: 'main', enabled: true })
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('push publishes the doc through a scratch clone without touching the project tree', async () => {
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      if (command === 'git' && args[0] === 'fetch') return fail('no such branch')
      if (command === 'git' && args[0] === 'diff') return { success: false, stdout: '', stderr: '', exitCode: 1 }
      return ok()
    }
    const sync = new OrgPolicySync(dir, { remote: 'git@example.com:org/brain.git', branch: 'main', enabled: true }, executor)
    const result = await sync.push(doc)

    expect(result.pushed).toBe(true)
    expect(result.message).toContain('git@example.com:org/brain.git@main')
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat.some(a => a.startsWith('init '))).toBe(true)
    expect(flat.some(a => a.startsWith('remote add origin git@example.com:org/brain.git'))).toBe(true)
    expect(flat).toContain('fetch --depth 1 origin main')
    // The doc is staged from the scratch clone's policies/ path.
    expect(flat).toContain(`add ${ORG_POLICY_REMOTE_PATH}`)
    expect(flat.some(a => a.startsWith('-c user.name=vectalon -c user.email=') && a.includes('commit -m sync: update org guardrail policy'))).toBe(true)
    expect(flat).toContain('push origin HEAD:main')
    // Nothing was written into the project working tree.
    expect(existsSync(join(dir, 'policies'))).toBe(false)
    expect(existsSync(join(dir, ORG_POLICY_REMOTE_PATH))).toBe(false)
  })

  it('push skips the commit when the remote policy is unchanged', async () => {
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      if (command === 'git' && args[0] === 'fetch') return ok()
      return ok()
    }
    const sync = new OrgPolicySync(dir, { remote: 'r', branch: 'main' }, executor)
    const result = await sync.push(doc)

    expect(result.pushed).toBe(false)
    expect(result.message).toContain('already up to date')
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat.some(a => a.includes('commit -m'))).toBe(false)
    expect(flat).not.toContain('push origin HEAD:main')
  })

  it('push reports failures', async () => {
    const executor = async (command: string, args: string[]): Promise<CommandResult> =>
      command === 'git' && args[0] === 'add' ? fail('permission denied') : ok()
    const sync = new OrgPolicySync(dir, { remote: 'r', branch: 'main' }, executor)
    const result = await sync.push(doc)
    expect(result.pushed).toBe(false)
    expect(result.message).toContain('permission denied')
  })

  it('pull fetches and caches the org policy via git show', async () => {
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      if (command === 'git' && args[0] === 'show') return ok(JSON.stringify(doc))
      return ok()
    }
    const sync = new OrgPolicySync(dir, { remote: 'git@example.com:org/brain.git', branch: 'main' }, executor)
    const result = await sync.pull()

    expect(result.pulled).toBe(true)
    expect(result.policy).toEqual(doc)
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat).toContain('fetch git@example.com:org/brain.git main')
    expect(flat).toContain('show FETCH_HEAD:policies/org-policy.json')

    const cached = readOrgPolicyCache(dir)
    expect(cached?.budgets).toEqual({ largeLibBytes: 65536 })
    expect(existsSync(orgPolicyCachePath(dir))).toBe(true)
  })

  it('pull reports when the remote has no org policy and writes nothing', async () => {
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      if (command === 'git' && args[0] === 'show') return fail("path 'policies/org-policy.json' does not exist")
      return ok()
    }
    const sync = new OrgPolicySync(dir, { remote: 'r', branch: 'main' }, executor)
    const result = await sync.pull()

    expect(result.pulled).toBe(false)
    expect(result.policy).toBeNull()
    expect(result.message).toContain('No org policy published')
    expect(existsSync(orgPolicyCachePath(dir))).toBe(false)
  })

  it('pull reports a corrupt remote doc without caching it', async () => {
    const executor = async (command: string, args: string[]): Promise<CommandResult> =>
      command === 'git' && args[0] === 'show' ? ok('not json{{') : ok()
    const sync = new OrgPolicySync(dir, { remote: 'r', branch: 'main' }, executor)
    const result = await sync.pull()
    expect(result.pulled).toBe(false)
    expect(result.message).toContain('not valid JSON')
    expect(existsSync(orgPolicyCachePath(dir))).toBe(false)
  })

  it('refuses to run when the sync config is disabled without force', async () => {
    writeSyncConfig(dir, { remote: 'r', branch: 'main', enabled: false })
    const executor = jest.fn(async () => ok())
    const sync = new OrgPolicySync(dir, { remote: 'r', branch: 'main', enabled: false }, executor)
    await expect(sync.push(doc)).rejects.toThrow(/disabled/)
    await expect(sync.pull()).rejects.toThrow(/disabled/)
    expect(executor).not.toHaveBeenCalled()
  })

  it('createOrgPolicySync returns null without a config and honors CLI overrides', async () => {
    const empty = createTempProject({})
    expect(createOrgPolicySync(empty)).toBeNull()
    cleanup(empty)
    const fresh = createTempProject({})
    writeSyncConfig(fresh, { remote: 'git@example.com:org/brain.git', branch: 'main', enabled: true })
    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      return ok(JSON.stringify(doc))
    }
    const sync = createOrgPolicySync(fresh, { remote: 'git@example.com:org/other.git', branch: 'dev', executor })
    expect(sync).not.toBeNull()
    const result = await sync!.pull()
    expect(result.pulled).toBe(true)
    expect(calls.map(([, a]) => a.join(' '))).toContain('fetch git@example.com:org/other.git dev')
    cleanup(fresh)
  })
})
