import { GuardrailRule, GuardrailResult, GuardrailConventions } from './types'
import { rules } from './rules'
import { safe } from '../utils/safe'

export interface GuardrailOptions {
  filePath: string
  content: string
  conventions?: GuardrailConventions
  rules?: GuardrailRule[]
}

/** The single diagnostic emitted when a rule crashes on a file (P0-9). */
export const RULE_CRASH_MESSAGE = 'Vectalon: could not parse file'

/**
 * Run every guardrail rule over a file. P0-9: each rule's `applicable` and
 * `check` run through `safe()` so a rule that crashes on exotic/corrupted
 * input degrades to one failed finding instead of killing the whole run (and
 * with it the extension's on-save diagnostics).
 */
export function runGuardrails(options: GuardrailOptions): GuardrailResult {
  const findings: GuardrailResult['findings'] = []
  let passed = 0
  let failed = 0
  let skipped = 0

  const rulesToRun = options.rules || rules

  for (const rule of rulesToRun) {
    if (rule.enabled === false) {
      skipped++
      continue
    }

    const applicableResult = safe(() => rule.applicable?.(options) ?? true)
    if (!applicableResult.ok || !applicableResult.value) {
      if (!applicableResult.ok) {
        // A crashing `applicable` is a rule failure, not a skip — surface it.
        failed++
        findings.push({
          rule: rule.name,
          severity: rule.severity,
          passed: false,
          message: `${RULE_CRASH_MESSAGE} (${rule.name} applicability check crashed: ${applicableResult.error.message})`,
        })
      } else {
        skipped++
      }
      continue
    }

    const result = safe(() => rule.check(options))
    if (result.ok) {
      if (result.value.passed) {
        passed++
      } else {
        failed++
      }
      findings.push({
        rule: rule.name,
        severity: rule.severity,
        passed: result.value.passed,
        message: result.value.message,
        line: result.value.line,
      })
    } else {
      // The rule crashed on this file — one diagnostic, never a crash.
      failed++
      findings.push({
        rule: rule.name,
        severity: rule.severity,
        passed: false,
        message: `${RULE_CRASH_MESSAGE} (rule ${rule.name} crashed: ${result.error.message})`,
      })
    }
  }

  return {
    filePath: options.filePath,
    passed,
    failed,
    skipped,
    findings,
    ok: failed === 0,
  }
}

export function formatGuardrailResult(result: GuardrailResult): string {
  const lines = [
    `Guardrails for \`${result.filePath}\``,
    '',
    `Passed: ${result.passed} | Failed: ${result.failed} | Skipped: ${result.skipped}`,
    '',
  ]

  for (const finding of result.findings) {
    const icon = finding.passed ? '✅' : finding.severity === 'error' ? '❌' : '⚠️'
    lines.push(`${icon} ${finding.rule}: ${finding.passed ? 'OK' : finding.message}`)
  }

  return lines.join('\n')
}
