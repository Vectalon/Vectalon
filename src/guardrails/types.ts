export type GuardrailSeverity = 'error' | 'warning' | 'info'

export interface GuardrailRule {
  id: string
  name: string
  description: string
  severity: GuardrailSeverity
  enabled?: boolean
  applicable?: (options: { filePath: string; content: string; conventions?: { hasTypeScript?: boolean; usesStyleSheet?: boolean; hasNavigation?: boolean } }) => boolean
  check: (options: { filePath: string; content: string }) => { passed: boolean; message?: string; line?: number }
}

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
