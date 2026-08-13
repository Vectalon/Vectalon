/**
 * Org-wide guardrail policy (Team brain v2)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One policy change in the team repo propagates to every project the team
 * gates. The team brain's sync remote (the same one `vectalon sync` uses for
 * knowledge) hosts `policies/org-policy.json` — a document with guardrail
 * policy (rule overrides, custom rules, code-review tuning) plus shared bundle
 * budgets. Projects pull it into `.vectalon/team/` (a gitignored cache) and
 * every gating surface layers it under the project's own policy:
 *
 *   effective = mergeOrgPolicy(org, local)
 *
 * Layering rule: the org policy is the baseline, the project refines it. The
 * project wins per-key conflicts (same rule id, same custom-rule id, same
 * codeReview field, same budget field): an org rule the project does not
 * touch applies everywhere, while a project that explicitly overrides a rule
 * keeps its decision. All merge functions are pure and deterministic; only
 * the cache/local file IO touches the disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { reportError } from '../utils/safe'
import type { PolicyConfig, PolicyRuleOverride } from '../guardrails/PolicyEngine'

/** Shared bundle budget thresholds — the knobs the bundle checkers already accept. */
export interface OrgBudgets {
  /** Library / asset size budget in bytes for bundle findings (default 100 KiB). */
  largeLibBytes?: number
  /** Image size budget in bytes for static checks (default 200 KiB). */
  imageBytes?: number
  /** Static asset size budget in bytes (default 1 MiB). */
  assetBytes?: number
  /** Check dependencies for `sideEffects: false` (default true). */
  sideEffects?: boolean
}

/** The document published on the sync remote under `policies/org-policy.json`. */
export interface OrgPolicyDoc {
  version: number
  policy: PolicyConfig
  budgets: OrgBudgets
  updatedAt: string
}

const ORG_CACHE_REL = join('.vectalon', 'team', 'org-policy.json')
const LOCAL_BUDGETS_REL = join('.vectalon', 'budgets.json')

export function orgPolicyCachePath(root: string): string {
  return join(root, ORG_CACHE_REL)
}

export function localBudgetsPath(root: string): string {
  return join(root, LOCAL_BUDGETS_REL)
}

/**
 * Org policy as baseline, local policy as refinement — per-key local wins.
 *
 * - rules: union of both rule maps; a local override of the same rule id wins.
 * - customRules: local customs first, then org customs whose id is not taken.
 * - codeReview: field-level merge, local wins (an org default still applies
 *   when the project says nothing about that field).
 */
export function mergeOrgPolicy(org: PolicyConfig | null, local: PolicyConfig): PolicyConfig {
  if (!org) return local

  const rules: Record<string, PolicyRuleOverride> = {}
  for (const [id, override] of Object.entries(org.rules || {})) {
    rules[id] = override
  }
  for (const [id, override] of Object.entries(local.rules || {})) {
    rules[id] = override
  }

  const localCustom = local.customRules || []
  const orgCustom = org.customRules || []
  const taken = new Set(localCustom.map(c => c.id))
  const customRules = [...localCustom, ...orgCustom.filter(c => !taken.has(c.id))]

  const codeReview = {
    ...(org.codeReview || {}),
    ...(local.codeReview || {}),
  }

  return {
    version: Math.max(org.version, local.version),
    rules,
    customRules,
    codeReview,
  }
}

/**
 * Budget merge: org thresholds are the baseline, only *defined* local fields
 * override them — an empty local config keeps the org values intact.
 */
export function mergeOrgBudgets(org: OrgBudgets | null, local: OrgBudgets): OrgBudgets {
  if (!org) return local
  const out: OrgBudgets = { ...org }
  if (local.largeLibBytes !== undefined) out.largeLibBytes = local.largeLibBytes
  if (local.imageBytes !== undefined) out.imageBytes = local.imageBytes
  if (local.assetBytes !== undefined) out.assetBytes = local.assetBytes
  if (local.sideEffects !== undefined) out.sideEffects = local.sideEffects
  return out
}

/**
 * Sanitize a parsed budget object: keep only finite positive numbers and
 * booleans, so a corrupted org doc or a hand-typed override can never inject
 * NaN/negative thresholds that silently break every check.
 */
export function sanitizeOrgBudgets(input: Partial<OrgBudgets> | null | undefined): OrgBudgets {
  const out: OrgBudgets = {}
  const num = (value: unknown, min: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.floor(value) : undefined
  out.largeLibBytes = num(input?.largeLibBytes, 1)
  out.imageBytes = num(input?.imageBytes, 1)
  out.assetBytes = num(input?.assetBytes, 1)
  out.sideEffects = typeof input?.sideEffects === 'boolean' ? input.sideEffects : undefined
  return out
}

/** Read the cached org policy (`.vectalon/team/org-policy.json`). Tolerant of garbage. */
export function readOrgPolicyCache(root: string): OrgPolicyDoc | null {
  try {
    const path = orgPolicyCachePath(root)
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<OrgPolicyDoc>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.policy !== 'object' || parsed.policy === null) {
      return null
    }
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      policy: parsed.policy as PolicyConfig,
      budgets: sanitizeOrgBudgets(parsed.budgets),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch (err) {
    reportError(err, 'orgPolicy: reading org policy cache')
    return null
  }
}

export function writeOrgPolicyCache(root: string, doc: OrgPolicyDoc): string {
  const path = orgPolicyCachePath(root)
  mkdirSync(join(root, '.vectalon', 'team'), { recursive: true })
  writeFileSync(path, JSON.stringify(doc, null, 2), 'utf-8')
  return path
}

/** Stop following the org policy. Returns true when a cache existed. */
export function clearOrgPolicyCache(root: string): boolean {
  const path = orgPolicyCachePath(root)
  if (!existsSync(path)) return false
  rmSync(path, { force: true })
  return true
}

/** Project-local budget overrides (`.vectalon/budgets.json`), sanitized. */
export function readLocalBudgets(root: string): OrgBudgets {
  try {
    const path = localBudgetsPath(root)
    if (!existsSync(path)) return {}
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<OrgBudgets>
    return sanitizeOrgBudgets(parsed)
  } catch (err) {
    reportError(err, 'orgPolicy: reading local budgets')
    return {}
  }
}

/** Merge a partial override into the local budget file (defined fields win). */
export function writeLocalBudgets(root: string, override: Partial<OrgBudgets>): string {
  const merged = sanitizeOrgBudgets({ ...readLocalBudgets(root), ...override })
  const path = localBudgetsPath(root)
  mkdirSync(join(root, '.vectalon'), { recursive: true })
  writeFileSync(path, JSON.stringify(merged, null, 2), 'utf-8')
  return path
}

/** Effective budget thresholds for a project: org cache + local overrides. */
export function loadEffectiveBudgets(root: string): OrgBudgets {
  const org = readOrgPolicyCache(root)?.budgets || null
  return mergeOrgBudgets(org, readLocalBudgets(root))
}

/** The opts object the bundle checkers accept, for projects with effective budgets. */
export interface BudgetCheckOpts {
  largeLibBytes?: number
  imageBytes?: number
  assetBytes?: number
  sideEffects?: boolean
}

export function budgetCheckOpts(root: string): BudgetCheckOpts {
  const budgets = loadEffectiveBudgets(root)
  return {
    largeLibBytes: budgets.largeLibBytes,
    imageBytes: budgets.imageBytes,
    assetBytes: budgets.assetBytes,
    sideEffects: budgets.sideEffects,
  }
}
