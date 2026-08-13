import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { teamPolicyCommand } from '../../src/cli/commands/teamPolicy'
import { writeSyncConfig } from '../../src/knowledge/artifactSync'
import { writeOrgPolicyCache, readOrgPolicyCache, readLocalBudgets, localBudgetsPath, orgPolicyCachePath } from '../../src/knowledge/orgPolicy'
import type { OrgPolicyDoc } from '../../src/knowledge/orgPolicy'
import { ORG_POLICY_REMOTE_PATH } from '../../src/knowledge/orgPolicySync'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { CommandResult } from '../../src/adapters/runCommand'

jest.mock('@vectalon-dev/core', () => ({
  requireTier: () => ({ allowed: true, currentTier: 'team', requiredTier: 'team', canTrial: false }),
}))

function ok(stdout = ''): CommandResult {
  return { success: true, stdout, stderr: '', exitCode: 0 }
}

function fail(stderr: string): CommandResult {
  return { success: false, stdout: '', stderr, exitCode: 1 }
}

describe('teamPolicyCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({ 'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }) })
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('writes local budget overrides with --budget', async () => {
    await teamPolicyCommand(dir, { budget: '{"largeLibBytes":65536}' })
    expect(readLocalBudgets(dir)).toEqual({ largeLibBytes: 65536 })
    expect(existsSync(localBudgetsPath(dir))).toBe(true)
  })

  it('rejects invalid --budget JSON', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    await teamPolicyCommand(dir, { budget: 'nope' })
    expect(exit).toHaveBeenCalledWith(1)
    expect(existsSync(localBudgetsPath(dir))).toBe(false)
  })

  it('removes the cached org policy with --remove', async () => {
    writeOrgPolicyCache(dir, {
      version: 1,
      policy: { version: 1, rules: {}, customRules: [] },
      budgets: {},
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    expect(existsSync(orgPolicyCachePath(dir))).toBe(true)
    await teamPolicyCommand(dir, { remove: true })
    expect(existsSync(orgPolicyCachePath(dir))).toBe(false)
    expect(readOrgPolicyCache(dir)).toBeNull()
  })

  it('checks a file against the effective (org + local) policy', async () => {
    writeOrgPolicyCache(dir, {
      version: 1,
      policy: {
        version: 1,
        rules: {},
        customRules: [{
          id: 'no-direct-navigation',
          name: 'No direct react-navigation imports',
          description: 'Use the project navigation wrapper instead.',
          severity: 'error',
          pattern: "import\\s+.*from\\s+['\"]@react-navigation/native['\"]",
        }],
      },
      budgets: {},
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    const target = join(dir, 'Home.tsx')
    writeFileSync(target, "import { useNavigation } from '@react-navigation/native';", 'utf-8')

    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    await teamPolicyCommand(dir, { check: target })
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('pushes the local policy + budgets as the org doc', async () => {
    writeSyncConfig(dir, { remote: 'git@example.com:org/brain.git', branch: 'main', enabled: true })
    writeFileSync(
      join(dir, '.vectalon', 'policy.json'),
      JSON.stringify({ version: 1, rules: { 'no-console-log': { enabled: false } }, customRules: [] }, null, 2),
      'utf-8'
    )
    writeFileSync(join(dir, '.vectalon', 'budgets.json'), JSON.stringify({ largeLibBytes: 65536 }), 'utf-8')

    const calls: Array<[string, string[]]> = []
    const executor = async (command: string, args: string[]): Promise<CommandResult> => {
      calls.push([command, args])
      if (command === 'git' && args[0] === 'fetch') return fail('no such branch')
      if (command === 'git' && args[0] === 'diff') return { success: false, stdout: '', stderr: '', exitCode: 1 }
      return ok()
    }
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    await teamPolicyCommand(dir, { push: true, executor })

    expect(exit).not.toHaveBeenCalled()
    const flat = calls.map(([, a]) => a.join(' '))
    expect(flat.some(a => a.startsWith('init '))).toBe(true)
    expect(flat).toContain('remote add origin git@example.com:org/brain.git')
    expect(flat).toContain('fetch --depth 1 origin main')
    expect(flat).toContain(`add ${ORG_POLICY_REMOTE_PATH}`)
    expect(flat.some(a => a.includes('commit -m sync: update org guardrail policy'))).toBe(true)
    expect(flat).toContain('push origin HEAD:main')
  })

  it('pulls the org policy into the cache', async () => {
    writeSyncConfig(dir, { remote: 'git@example.com:org/brain.git', branch: 'main', enabled: true })
    const doc: OrgPolicyDoc = {
      version: 1,
      policy: { version: 1, rules: { 'no-hardcoded-urls': { enabled: false } }, customRules: [] },
      budgets: { assetBytes: 900000 },
      updatedAt: '2026-08-13T00:00:00.000Z',
    }
    const executor = async (command: string, args: string[]): Promise<CommandResult> =>
      command === 'git' && args[0] === 'show' ? ok(JSON.stringify(doc)) : ok()
    await teamPolicyCommand(dir, { pull: true, executor })

    const cached = readOrgPolicyCache(dir)
    expect(cached?.policy.rules?.['no-hardcoded-urls']).toEqual({ enabled: false })
    expect(cached?.budgets).toEqual({ assetBytes: 900000 })
  })

  it('fails without a sync config for push/pull', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    await teamPolicyCommand(dir, { pull: true })
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('fails on push when the local policy file is missing', async () => {
    writeSyncConfig(dir, { remote: 'git@example.com:org/brain.git', branch: 'main', enabled: true })
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    await teamPolicyCommand(dir, { push: true })
    expect(exit).toHaveBeenCalledWith(1)
  })
})
