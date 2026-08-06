/**
 * Vectalon RN — Guardrails and code quality
 * Business Source License 1.1 (BSL-1.1)
 */

import { GuardrailRule, GuardrailResult, GuardrailConventions, GuardrailFinding } from './types'
import { rules } from './rules'
import { PolicyEngine, initPolicy, runPolicy, defaultPolicy, defaultCodeReviewPolicy } from './PolicyEngine'
import { runGuardrails, formatGuardrailResult } from './engine'

export { GuardrailRule, GuardrailResult }
export type { GuardrailConventions, GuardrailFinding }
export { rules }
export { PolicyEngine, initPolicy, runPolicy, defaultPolicy, defaultCodeReviewPolicy }
export type { PolicyConfig, PolicyRuleOverride, PolicyCustomRule, PolicyOptions, PolicyRunResult, CodeReviewPolicy } from './PolicyEngine'
export { runGuardrails, formatGuardrailResult }
export type { GuardrailOptions } from './engine'
