export type GuardrailSeverity = 'error' | 'warning' | 'info'

export interface GuardrailConventions {
  hasTypeScript?: boolean
  usesStyleSheet?: boolean
  hasNavigation?: boolean
  /** Detected React Native New Architecture state. */
  newArchitecture?: import('../utils/newArchitecture').NewArchitectureInfo
  /** React version resolved from the manifest ('' when unknown). */
  reactVersion?: string
  /** Detected React 19 / React Compiler state. */
  reactCompiler?: import('../utils/reactCompiler').ReactCompilerInfo
}

export interface GuardrailRule {
  id: string
  name: string
  description: string
  severity: GuardrailSeverity
  enabled?: boolean
  applicable?: (options: GuardrailContext) => boolean
  check: (options: GuardrailContext) => { passed: boolean; message?: string; line?: number }
}

export interface GuardrailContext {
  filePath: string
  content: string
  conventions?: GuardrailConventions
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
