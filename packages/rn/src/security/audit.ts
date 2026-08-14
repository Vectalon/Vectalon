/**
 * vectalon sec — dependency advisory pass (Roadmap Phase 8, item 063)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Best-effort `npm audit --json` integration: real projects get their
 * dependency advisories; anything that makes the audit impossible (no
 * lockfile, no npm, no network, unparseable output) degrades to a skipped
 * audit instead of failing the review. The parser is a pure function so the
 * mapping is hermetic-testable without spawning npm.
 */

import { runCommand } from '../adapters/runCommand'
import type { SecurityAudit, SecurityVuln } from './types'

/** Parse `npm audit --json` output (v7+ shape) into our vuln model. */
export function parseNpmAudit(stdout: string): SecurityAudit | null {
  if (!stdout.trim()) return null
  let json: Record<string, unknown>
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  const meta = (json.metadata as { vulnerabilities?: Record<string, number> } | undefined)?.vulnerabilities ?? {}
  const vulnMap = (json.vulnerabilities ?? {}) as Record<string, {
    severity?: string
    isDirect?: boolean
    via?: unknown[]
  }>
  const vulnerabilities: SecurityVuln[] = []
  for (const [name, entry] of Object.entries(vulnMap)) {
    const via = Array.isArray(entry.via) ? entry.via : []
    vulnerabilities.push({
      package: name,
      severity: (entry.severity as SecurityVuln['severity']) ?? 'info',
      isDirect: Boolean(entry.isDirect),
      advisoryCount: via.filter(v => typeof v === 'object').length || via.length,
    })
  }
  vulnerabilities.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.package.localeCompare(b.package))
  return {
    ran: true,
    total: meta.total ?? 0,
    critical: meta.critical ?? 0,
    high: meta.high ?? 0,
    moderate: meta.moderate ?? 0,
    low: meta.low ?? 0,
    vulnerabilities,
  }
}

function severityRank(sev: SecurityVuln['severity']): number {
  return sev === 'critical' ? 5 : sev === 'high' ? 4 : sev === 'moderate' ? 3 : sev === 'low' ? 2 : 1
}

/** Run the real `npm audit --json` against the project (degrading gracefully). */
export async function runNpmAudit(root: string, timeoutMs = 90000): Promise<SecurityAudit> {
  let result
  try {
    result = await runCommand('npm', ['audit', '--json'], { cwd: root, timeout: timeoutMs })
  } catch (err) {
    return { ran: false, skippedReason: `npm audit failed to start: ${err instanceof Error ? err.message : String(err)}`, total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
  }
  // npm exits non-zero when it finds vulnerabilities — the JSON is still on
  // stdout, so parse first and only treat an empty/unparseable stdout as a
  // skip (no lockfile, npm missing, registry unreachable).
  const parsed = parseNpmAudit(result.stdout)
  if (parsed) return parsed
  const reason = result.stderr.trim() || `npm audit exited ${result.exitCode} with no parseable output`
  return { ran: false, skippedReason: reason, total: 0, critical: 0, high: 0, moderate: 0, low: 0, vulnerabilities: [] }
}
