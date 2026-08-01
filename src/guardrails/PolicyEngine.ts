import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { rules as baseRules } from './rules'
import { runGuardrails } from './engine'
import type { GuardrailRule, GuardrailResult, GuardrailSeverity } from './types'

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

export interface PolicyConfig {
  version: number
  rules?: Record<string, PolicyRuleOverride>
  customRules?: PolicyCustomRule[]
}

export interface PolicyOptions {
  filePath: string
  content: string
  conventions?: {
    hasTypeScript?: boolean
    usesStyleSheet?: boolean
    hasNavigation?: boolean
  }
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

export const defaultPolicy: PolicyConfig = {
  version: 1,
  rules: {},
  customRules: [],
}

function compileCustomRule(custom: PolicyCustomRule): GuardrailRule | null {
  let regex: RegExp
  let fileRegex: RegExp | null = null

  try {
    regex = new RegExp(custom.pattern)
    if (custom.filePattern) {
      fileRegex = new RegExp(custom.filePattern)
    }
  } catch {
    // A malformed pattern in policy.json must not crash the workflow;
    // the invalid rule is skipped instead.
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
      writeFileSync(this.policyPath, JSON.stringify(defaultPolicy, null, 2), 'utf-8')
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

  private load(): PolicyConfig {
    if (!existsSync(this.policyPath)) {
      return defaultPolicy
    }
    try {
      const parsed = JSON.parse(readFileSync(this.policyPath, 'utf-8')) as PolicyConfig
      return {
        ...defaultPolicy,
        ...parsed,
        customRules: parsed.customRules || defaultPolicy.customRules,
      }
    } catch {
      return defaultPolicy
    }
  }
}

export function initPolicy(projectRoot: string): string {
  return new PolicyEngine(projectRoot).initPolicy()
}

export function runPolicy(projectRoot: string, options: PolicyOptions): PolicyRunResult {
  return new PolicyEngine(projectRoot).runPolicy(options)
}
