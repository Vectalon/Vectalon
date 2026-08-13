/**
 * Self-healing CI gate — file a triaged incident for a CI gate failure.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The natural bridge from release monitoring to CI: a failing gate (visual
 * regression, quality checks, bundle budgets, benchmark regression) is run
 * through the same IncidentAnalyzer used by the crash monitors, so every CI
 * failure becomes a triaged incident the team brain learns from — with a
 * rollback suggestion derived from the failing branch and commit.
 *
 * Fully deterministic — no model calls. The module is pure; git resolution
 * (branch/commit) lives in the CLI commands so the core stays unit-testable
 * through its interface.
 */

import { IncidentAnalyzer } from './IncidentAnalyzer'
import type { IncidentAnalysis } from './IncidentAnalyzer'
import type { ArtifactStore } from '../knowledge/ArtifactStore'
import type { ParsedCrash } from '../knowledge/telemetry'

export interface CiGateFailureInput {
  /** Gate that failed, e.g. 'visual-regression' | 'quality' | 'bundle-budget'. */
  gate: string
  /** Workflow step name, when known. */
  step?: string
  /** The failing command, when known. */
  command?: string
  exitCode?: number
  /** Failing output (truncated to 4000 chars in the persisted report). */
  output?: string
  branch?: string
  /** Failing commit sha (short form ok). */
  commit?: string
  severity?: 'sev1' | 'sev2' | 'sev3'
  /** Runtime crash reports to correlate with the gate failure (optional). */
  crashes?: ParsedCrash[]
}

export interface CiGateRollback {
  /** Rollback command to run, or null when a revert does not apply. */
  command: string | null
  note: string
}

export interface CiGateIncidentResult {
  incident: IncidentAnalysis
  rollback: CiGateRollback
  /** KB artifact id, or null when no store was provided / persistence failed. */
  artifactId: string | null
  report: string
}

const DEFAULT_BRANCHES = new Set(['main', 'master'])
const OUTPUT_LIMIT = 4000

function isDefaultBranch(branch: string): boolean {
  return DEFAULT_BRANCHES.has(branch) || branch.endsWith('/main') || branch.endsWith('/master')
}

/** Rollback guidance: revert on the default branch, fix-the-PR otherwise. */
export function rollbackFor(input: Pick<CiGateFailureInput, 'branch' | 'commit'>): CiGateRollback {
  const branch = input.branch || 'current'
  const onDefault = isDefaultBranch(branch)
  if (input.commit) {
    return onDefault
      ? { command: `git revert ${input.commit}`, note: 'Revert the failing commit on the default branch, then re-run the gate.' }
      : { command: null, note: `PR branch (${branch}) — fix the failing gate and push a new commit; do not merge as-is.` }
  }
  return onDefault
    ? { command: null, note: 'No commit known — inspect the failing step and roll back the last merge or deploy.' }
    : { command: null, note: `PR branch (${branch}) — fix the failing gate; do not merge as-is.` }
}

/** Render the triaged CI incident as a markdown report (also the KB artifact body). */
export function renderCiGateReport(
  incident: IncidentAnalysis,
  rollback: CiGateRollback,
  context: Pick<CiGateFailureInput, 'gate' | 'step' | 'command' | 'exitCode' | 'branch' | 'commit' | 'output'>
): string {
  const lines = [
    `## 🚦 CI gate incident — ${context.gate}`,
    '',
    `- **Gate:** ${context.gate}`,
    context.step ? `- **Step:** ${context.step}` : null,
    context.command ? `- **Command:** \`${context.command}\`` : null,
    context.exitCode !== undefined ? `- **Exit code:** ${context.exitCode}` : null,
    `- **Branch:** ${context.branch || 'current'}`,
    context.commit ? `- **Commit:** ${context.commit}` : null,
    '',
    '### Triage (IncidentAnalyzer)',
    '',
    `- **Severity:** ${incident.severity}`,
    `- **Impact:** ${incident.impact}`,
    `- **Cause bucket:** ${incident.causeBucket}`,
    `- **Probable cause:** ${incident.probableCause}`,
    '',
    '### Rollback',
    '',
    rollback.command ? `- \`${rollback.command}\` — ${rollback.note}` : `- ${rollback.note}`,
    '',
    '### Actions',
    '',
    ...incident.actions.map(a => `- ${a}`),
    '',
  ].filter((line): line is string => line !== null)
  // The caller truncates to OUTPUT_LIMIT (marker included) — render as-is.
  if (context.output && context.output.trim()) {
    lines.push('### Failure context', '', '```', context.output.trim(), '```', '')
  }
  return lines.join('\n')
}

/**
 * File a triaged incident for a CI gate failure: run the failure context
 * through IncidentAnalyzer, derive the rollback suggestion, and (when a store
 * is given) persist it as an `operations` artifact so the knowledge base
 * learns from every CI failure. Never throws.
 */
export function fileCiGateIncident(
  input: CiGateFailureInput,
  store?: ArtifactStore
): CiGateIncidentResult {
  const branch = input.branch || 'current'
  const commit = input.commit || null
  const shortCommit = commit ? (commit.length > 7 ? commit.slice(0, 7) : commit) : null

  const details = [
    input.step ? `Step: ${input.step}` : null,
    input.command ? `Command: ${input.command}` : null,
    input.exitCode !== undefined ? `Exit code: ${input.exitCode}` : null,
    `Branch: ${branch}`,
    commit ? `Commit: ${commit}` : null,
  ].filter((d): d is string => d !== null).join('\n')

  const rawOutput = (input.output || '').trim()
  const output = rawOutput.length > OUTPUT_LIMIT
    ? rawOutput.slice(0, OUTPUT_LIMIT) + '\n… (truncated)'
    : rawOutput

  const description = [
    `CI gate "${input.gate}" failed.`,
    details,
    output ? `\nOutput:\n${output}` : '',
  ].join('\n')

  const incident = new IncidentAnalyzer().analyze({
    title: `CI gate failed: ${input.gate}${shortCommit ? ` @ ${shortCommit}` : ''}`,
    description,
    severity: input.severity,
    crashes: input.crashes || [],
  })

  const rollback = rollbackFor({ branch, commit: commit || undefined })
  const report = renderCiGateReport(incident, rollback, {
    gate: input.gate,
    step: input.step,
    command: input.command,
    exitCode: input.exitCode,
    branch,
    commit: commit || undefined,
    output,
  })

  let artifactId: string | null = null
  if (store) {
    try {
      const artifact = store.add({
        type: 'operations',
        title: `Incident: ${incident.title}`,
        content: report,
        source: 'generated',
        status: 'active',
        meta: {
          kind: 'ci-gate',
          gate: input.gate,
          branch,
          commit: commit || '',
          exitCode: input.exitCode !== undefined ? String(input.exitCode) : '',
        },
      })
      artifactId = artifact.id
    } catch (err) {
      // A KB write failure must never break the incident command.
    }
  }

  return { incident, rollback, artifactId, report }
}
