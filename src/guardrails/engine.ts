import { GuardrailRule, GuardrailResult } from './types'
import { rules } from './rules'

export interface GuardrailOptions {
  filePath: string
  content: string
  conventions?: {
    hasTypeScript?: boolean
    usesStyleSheet?: boolean
    hasNavigation?: boolean
  }
  rules?: GuardrailRule[]
}

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

    const applicable = rule.applicable?.(options) ?? true
    if (!applicable) {
      skipped++
      continue
    }

    const result = rule.check(options)
    if (result.passed) {
      passed++
    } else {
      failed++
    }
    findings.push({
      rule: rule.name,
      severity: rule.severity,
      passed: result.passed,
      message: result.message,
      line: result.line,
    })
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
