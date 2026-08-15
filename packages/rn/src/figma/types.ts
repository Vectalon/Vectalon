/**
 * vectalon figma — Figma-to-code Sync Agent (Roadmap Phase 10, item 080)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Parses a Figma design export (JSON) and checks drift against the codebase:
 * colors used in the design that have no design token / hardcoded code value,
 * component names in the design with no matching source component, and text
 * styles with no matching font usage. Deterministic — no model calls.
 */

export interface FigmaColor {
  name: string
  hex: string
}

export interface FigmaComponent {
  name: string
  type: 'component' | 'frame' | 'text'
}

export interface FigmaFinding {
  id: 'missing-token' | 'missing-component' | 'missing-font'
  severity: 'warning' | 'info'
  designName: string
  message: string
  suggestion: string
}

export interface FigmaReport {
  scannedAt: number
  root: string
  designFile?: string
  colors: FigmaColor[]
  components: FigmaComponent[]
  findings: FigmaFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
