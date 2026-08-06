/**
 * Parsing / mapping helpers for `check_guardrails` tool output. Pure module —
 * no `vscode` import, so the mapping logic is unit-testable. The vscode layer
 * converts these findings into `vscode.Diagnostic`s.
 */

export type GuardrailSeverity = 'error' | 'warning' | 'info'

export interface GuardrailFinding {
  rule: string
  severity: GuardrailSeverity
  passed: boolean
  message?: string
  line?: number
}

export interface GuardrailResult {
  filePath: string
  passed: number
  failed: number
  skipped: number
  findings: GuardrailFinding[]
  ok: boolean
}

/** Parse the JSON returned by the check_guardrails tool (tolerant). */
export function parseGuardrailResult(raw: string): GuardrailResult | null {
  try {
    const data = JSON.parse(raw) as GuardrailResult
    if (typeof data.ok !== 'boolean' || !Array.isArray(data.findings)) return null
    return data
  } catch {
    return null
  }
}

/** The rules that actually failed, with line numbers where available. */
export function failingFindings(result: GuardrailResult): GuardrailFinding[] {
  return result.findings.filter(f => !f.passed)
}

/**
 * Map a guardrail severity to a numeric diagnostic severity, following the
 * VS Code convention (0 = Error, 1 = Warning, 2 = Information).
 */
export function severityToNumber(severity: GuardrailSeverity): number {
  switch (severity) {
    case 'error':
      return 0
    case 'warning':
      return 1
    default:
      return 2
  }
}

/** Group findings by rule name for status-bar summaries. */
export function summarize(result: GuardrailResult): string {
  const failed = failingFindings(result)
  if (failed.length === 0) return `✓ ${result.passed} guardrail(s) passed`
  const errors = failed.filter(f => f.severity === 'error').length
  const warnings = failed.filter(f => f.severity === 'warning').length
  return `⚠ ${failed.length} issue(s) — ${errors} error(s), ${warnings} warning(s)`
}
