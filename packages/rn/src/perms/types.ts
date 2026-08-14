/**
 * vectalon perms — Agent Permissions Audit (Roadmap Phase 9, item 078)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scans agent/MCP configuration (Claude Code settings, Cursor MCP, generic
 * .mcp.json, .agents skills) for over-permissioned tool grants and
 * credentials sitting in config files. Deterministic, line-pinned.
 */

export interface PermFinding {
  id: string
  severity: 'error' | 'warning' | 'info'
  file: string
  line: number
  message: string
  suggestion: string
}

export interface PermReport {
  scannedAt: number
  root: string
  configFiles: string[]
  findings: PermFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
