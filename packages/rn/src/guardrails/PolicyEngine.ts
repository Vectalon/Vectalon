import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { rules as baseRules } from './rules'
import { runGuardrails } from './engine'
import type { GuardrailRule, GuardrailResult, GuardrailSeverity, GuardrailConventions } from './types'
import { reportError } from '../utils/safe'
import { readOrgPolicyCache, mergeOrgPolicy } from '../knowledge/orgPolicy'

export interface PolicyRuleOverride {
  enabled?: boolean
  severity?: GuardrailSeverity
}

export interface PolicyCustomRule {
  id: string
  name: string
  description: string
  severity: GuardrailSeverity
  pattern: string
  message?: string
  filePattern?: string
}

/**
 * Self-healing code-review tuning, read by the code-review phase.
 *
 * - maxAttempts: review→fix→re-review cycles before giving up (default 3).
 * - healSeverity: lowest finding severity that triggers the heal loop —
 *   'error' heals only errors, 'warning' also heals warnings, 'info' all
 *   (default 'error'). The phase still only fails on error findings.
 * - toolChecks: run lint/typecheck after the LLM review loop and feed those
 *   errors back through the heal loop (default true, requires a real runner).
 */
export interface CodeReviewPolicy {
  maxAttempts?: number
  healSeverity?: GuardrailSeverity
  toolChecks?: boolean
}

export interface PolicyConfig {
  version: number
  rules?: Record<string, PolicyRuleOverride>
  customRules?: PolicyCustomRule[]
  codeReview?: CodeReviewPolicy
}

export interface PolicyOptions {
  filePath: string
  content: string
  conventions?: GuardrailConventions
}

export interface PolicyRunResult {
  filePath: string
  passed: number
  failed: number
  skipped: number
  findings: GuardrailResult['findings']
  ok: boolean
  policyPath?: string
}

const POLICY_FILE = 'policy.json'

/** A missing/corrupt local policy contributes no decisions to the org merge. */
const EMPTY_LOCAL_POLICY: PolicyConfig = { version: 1, rules: {}, customRules: [] }

export const defaultCodeReviewPolicy: Required<CodeReviewPolicy> = {
  maxAttempts: 3,
  healSeverity: 'error',
  toolChecks: true,
}

export const defaultPolicy: PolicyConfig = {
  version: 1,
  rules: {},
  customRules: [],
  codeReview: defaultCodeReviewPolicy,
}

function compileCustomRule(custom: PolicyCustomRule): GuardrailRule | null {
  let regex: RegExp
  let fileRegex: RegExp | null = null

  try {
    regex = new RegExp(custom.pattern)
    if (custom.filePattern) {
      fileRegex = new RegExp(custom.filePattern)
    }
  } catch (err) {
    // A malformed pattern in policy.json must not crash the workflow;
    // the invalid rule is skipped instead.
    reportError(err, 'PolicyEngine: compiling custom rule pattern')
    return null
  }

  return {
    id: custom.id,
    name: custom.name,
    description: custom.description,
    severity: custom.severity,
    applicable: ({ filePath }) => (fileRegex ? fileRegex.test(filePath) : true),
    check: ({ content }) => {
      const match = content.match(regex)
      if (match) {
        return {
          passed: false,
          message: custom.message || `Matched forbidden pattern: ${custom.pattern}`,
          line: content.slice(0, match.index || 0).split('\n').length,
        }
      }
      return { passed: true }
    },
  }
}

export class PolicyEngine {
  private projectRoot: string
  private policyPath: string
  private policy: PolicyConfig

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
    this.policyPath = join(projectRoot, '.vectalon', POLICY_FILE)
    this.policy = this.load()
  }

  getPolicy(): PolicyConfig {
    return this.policy
  }

  /** Resolved code-review tuning (policy values merged over defaults). */
  getCodeReviewPolicy(): Required<CodeReviewPolicy> {
    const user = this.policy.codeReview || {}
    return {
      maxAttempts:
        typeof user.maxAttempts === 'number' && user.maxAttempts >= 1
          ? Math.floor(user.maxAttempts)
          : defaultCodeReviewPolicy.maxAttempts,
      healSeverity:
        user.healSeverity === 'warning' || user.healSeverity === 'info'
          ? user.healSeverity
          : defaultCodeReviewPolicy.healSeverity,
      toolChecks: typeof user.toolChecks === 'boolean' ? user.toolChecks : defaultCodeReviewPolicy.toolChecks,
    }
  }

  getPolicyPath(): string {
    return this.policyPath
  }

  getEffectiveRules(): GuardrailRule[] {
    const effective: GuardrailRule[] = baseRules.map(rule => {
      const override = this.policy.rules?.[rule.id]
      if (!override) return rule
      return {
        ...rule,
        enabled: override.enabled ?? rule.enabled,
        severity: override.severity ?? rule.severity,
      }
    })

    const custom = (this.policy.customRules || [])
      .map(compileCustomRule)
      .filter((rule): rule is GuardrailRule => rule !== null)
    return [...effective, ...custom]
  }

  runPolicy(options: PolicyOptions): PolicyRunResult {
    const effectiveRules = this.getEffectiveRules()
    const result = runGuardrails({ ...options, rules: effectiveRules })
    return {
      ...result,
      policyPath: this.policyPath,
    }
  }

  initPolicy(): string {
    if (!existsSync(dirname(this.policyPath))) {
      mkdirSync(dirname(this.policyPath), { recursive: true })
    }
    if (!existsSync(this.policyPath)) {
      // Write a lean default WITHOUT codeReview tuning: defaults apply in
      // memory, so a freshly initialized project never claims an explicit
      // codeReview decision that would shadow an org policy (Team brain v2).
      writeFileSync(this.policyPath, JSON.stringify({ version: defaultPolicy.version, rules: {}, customRules: [] }, null, 2), 'utf-8')
    }
    return this.policyPath
  }

  updatePolicy(policy: PolicyConfig): void {
    this.policy = policy
    if (!existsSync(dirname(this.policyPath))) {
      mkdirSync(dirname(this.policyPath), { recursive: true })
    }
    writeFileSync(this.policyPath, JSON.stringify(policy, null, 2), 'utf-8')
  }

  /**
   * Effective policy = the project's `.vectalon/policy.json` layered under the
   * org policy cached at `.vectalon/team/org-policy.json` (Team brain v2): the
   * org policy is the baseline, the project refines it. Every PolicyEngine
   * consumer — `policy --check`, the code-review phase, the MCP review tool —
   * therefore enforces the org policy the moment it is pulled.
   *
   * The local file is read RAW (no default filling) so defaults never clobber
   * an org decision the project did not make; defaults are applied only after
   * the merge, to fields still missing from the effective policy.
   */
  private load(): PolicyConfig {
    const org = readOrgPolicyCache(this.projectRoot)?.policy || null
    const merged = mergeOrgPolicy(org, this.readLocalPolicy())
    return {
      ...defaultPolicy,
      ...merged,
      customRules: merged.customRules || defaultPolicy.customRules,
      codeReview: merged.codeReview || defaultPolicy.codeReview,
    }
  }

  private readLocalPolicy(): PolicyConfig {
    if (!existsSync(this.policyPath)) {
      return EMPTY_LOCAL_POLICY
    }
    try {
      return JSON.parse(readFileSync(this.policyPath, 'utf-8')) as PolicyConfig
    } catch (err) {
      reportError(err, 'PolicyEngine: reading policy.json')
      return EMPTY_LOCAL_POLICY
    }
  }
}

export function initPolicy(projectRoot: string): string {
  return new PolicyEngine(projectRoot).initPolicy()
}

export function runPolicy(projectRoot: string, options: PolicyOptions): PolicyRunResult {
  return new PolicyEngine(projectRoot).runPolicy(options)
}
