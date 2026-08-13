import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import {
  mergeOrgPolicy,
  mergeOrgBudgets,
  sanitizeOrgBudgets,
  readOrgPolicyCache,
  writeOrgPolicyCache,
  clearOrgPolicyCache,
  readLocalBudgets,
  writeLocalBudgets,
  loadEffectiveBudgets,
  budgetCheckOpts,
  orgPolicyCachePath,
  localBudgetsPath,
  type OrgPolicyDoc,
} from '../../src/knowledge/orgPolicy'
import type { PolicyConfig } from '../../src/guardrails/PolicyEngine'

const local: PolicyConfig = {
  version: 1,
  rules: { 'no-console-log': { enabled: false } },
  customRules: [{ id: 'local-rule', name: 'L', description: 'd', severity: 'warning', pattern: 'local' }],
  codeReview: { maxAttempts: 2 },
}

const orgPolicy: PolicyConfig = {
  version: 1,
  rules: { 'no-console-log': { severity: 'error' }, 'no-hardcoded-urls': { enabled: false } },
  customRules: [{ id: 'org-rule', name: 'O', description: 'd', severity: 'error', pattern: 'org' }],
  codeReview: { healSeverity: 'warning' },
}

describe('mergeOrgPolicy', () => {
  it('returns the local policy unchanged when there is no org policy', () => {
    expect(mergeOrgPolicy(null, local)).toBe(local)
  })

  it('layers org rules under local rules, per-key local wins', () => {
    const merged = mergeOrgPolicy(orgPolicy, local)
    // Org rule not overridden locally is active.
    expect(merged.rules?.['no-hardcoded-urls']).toEqual({ enabled: false })
    // Local override of the same rule id wins.
    expect(merged.rules?.['no-console-log']).toEqual({ enabled: false })
    // Both custom rules survive (local first, org second), deduped by id.
    expect(merged.customRules?.map(r => r.id)).toEqual(['local-rule', 'org-rule'])
  })

  it('dedupes custom rules by id with the local rule winning', () => {
    const merged = mergeOrgPolicy(
      { version: 1, rules: {}, customRules: [{ id: 'dup', name: 'org', description: 'd', severity: 'error', pattern: 'org' }] },
      { version: 1, rules: {}, customRules: [{ id: 'dup', name: 'local', description: 'd', severity: 'info', pattern: 'local' }] }
    )
    expect(merged.customRules).toHaveLength(1)
    expect(merged.customRules?.[0].name).toBe('local')
  })

  it('merges codeReview per-field with local winning', () => {
    const merged = mergeOrgPolicy(orgPolicy, local)
    expect(merged.codeReview).toEqual({ maxAttempts: 2, healSeverity: 'warning' })
  })

  it('uses the max version', () => {
    const merged = mergeOrgPolicy({ ...orgPolicy, version: 3 }, local)
    expect(merged.version).toBe(3)
  })
})

describe('mergeOrgBudgets + sanitize', () => {
  it('keeps org thresholds when the local config is empty', () => {
    expect(mergeOrgBudgets({ largeLibBytes: 65536, imageBytes: 100000 }, {})).toEqual({
      largeLibBytes: 65536,
      imageBytes: 100000,
    })
  })

  it('only defined local fields override the org baseline', () => {
    const merged = mergeOrgBudgets({ largeLibBytes: 65536, imageBytes: 100000 }, { imageBytes: 200000 })
    expect(merged).toEqual({ largeLibBytes: 65536, imageBytes: 200000 })
  })

  it('sanitize drops NaN, negatives, and non-booleans', () => {
    expect(
      sanitizeOrgBudgets({ largeLibBytes: Number.NaN, imageBytes: -5, assetBytes: 100, sideEffects: 'yes' as never })
    ).toEqual({ assetBytes: 100 })
  })
})

describe('org policy cache + budget IO', () => {
  let dir: string

  beforeEach(() => {
    dir = createTempProject({})
  })

  afterEach(() => {
    cleanup(dir)
  })

  it('writes, reads, and clears the org policy cache', () => {
    const doc: OrgPolicyDoc = { version: 1, policy: orgPolicy, budgets: { largeLibBytes: 65536 }, updatedAt: '2026-08-13T00:00:00.000Z' }
    const path = writeOrgPolicyCache(dir, doc)
    expect(path).toBe(orgPolicyCachePath(dir))
    expect(existsSync(path)).toBe(true)

    const read = readOrgPolicyCache(dir)
    expect(read?.policy.rules?.['no-hardcoded-urls']).toEqual({ enabled: false })
    expect(read?.budgets).toEqual({ largeLibBytes: 65536 })
    expect(read?.updatedAt).toBe('2026-08-13T00:00:00.000Z')

    expect(clearOrgPolicyCache(dir)).toBe(true)
    expect(readOrgPolicyCache(dir)).toBeNull()
    expect(clearOrgPolicyCache(dir)).toBe(false)
  })

  it('returns null for a corrupt cache and tolerates garbage budgets', () => {
    writeOrgPolicyCache(dir, { version: 1, policy: orgPolicy, budgets: {}, updatedAt: '' })
    const path = orgPolicyCachePath(dir)
    writeFileSync(path, 'not json{{')
    expect(readOrgPolicyCache(dir)).toBeNull()
  })

  it('reads, merges, and persists local budget overrides', () => {
    expect(readLocalBudgets(dir)).toEqual({})
    const path = writeLocalBudgets(dir, { largeLibBytes: 65536 })
    expect(path).toBe(localBudgetsPath(dir))
    expect(readLocalBudgets(dir)).toEqual({ largeLibBytes: 65536 })

    writeLocalBudgets(dir, { imageBytes: 12345 })
    expect(readLocalBudgets(dir)).toEqual({ largeLibBytes: 65536, imageBytes: 12345 })
  })

  it('loadEffectiveBudgets layers org under local', () => {
    writeOrgPolicyCache(dir, { version: 1, policy: orgPolicy, budgets: { largeLibBytes: 50000, assetBytes: 500000 }, updatedAt: '' })
    writeLocalBudgets(dir, { assetBytes: 900000 })
    expect(loadEffectiveBudgets(dir)).toEqual({ largeLibBytes: 50000, assetBytes: 900000 })
  })

  it('budgetCheckOpts is empty without any config and populated with it', () => {
    expect(budgetCheckOpts(dir)).toEqual({})
    writeOrgPolicyCache(dir, { version: 1, policy: orgPolicy, budgets: { largeLibBytes: 40000, sideEffects: false }, updatedAt: '' })
    expect(budgetCheckOpts(dir)).toEqual({ largeLibBytes: 40000, sideEffects: false })
  })

  it('a pulled doc written to disk is readable through the cache path', () => {
    const doc: OrgPolicyDoc = { version: 2, policy: orgPolicy, budgets: {}, updatedAt: '2026-08-13T00:00:00.000Z' }
    writeOrgPolicyCache(dir, doc)
    const raw = JSON.parse(readFileSync(join(dir, '.vectalon', 'team', 'org-policy.json'), 'utf-8'))
    expect(raw.version).toBe(2)
  })
})
