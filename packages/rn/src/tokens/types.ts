/**
 * vectalon tokens — Design Token Sync Agent (Roadmap Phase 9, item 076)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses a design-token JSON (style-dictionary style: nested objects whose
 * leaves carry `value`) and checks the source for drift: tokens never
 * referenced in code (orphans), hardcoded values that should be tokens
 * (drift), and tokens that duplicate each other's values.
 */

export interface TokenEntry {
  path: string[]
  value: string
  /** PascalCase join used by many generators (color.primary → ColorPrimary). */
  pascal: string
  /** camelCase join (color.primary → colorPrimary). */
  camel: string
}

export interface TokenFinding {
  id: 'orphan-token' | 'hardcoded-value' | 'duplicate-value'
  severity: 'warning' | 'info'
  token?: string
  file?: string
  line?: number
  message: string
  suggestion: string
}

export interface TokenReport {
  scannedAt: number
  root: string
  tokenFile?: string
  tokenCount: number
  findings: TokenFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
