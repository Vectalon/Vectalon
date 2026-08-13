/**
 * vectalon ci-incident — self-healing CI gate
 * Business Source License 1.1 (BSL-1.1)
 *
 * File a triaged incident (severity, cause bucket, actions) for a failed CI
 * gate — quality checks, visual regression, bundle budgets, benchmark
 * regression — with a rollback suggestion derived from the failing branch and
 * commit. The incident lands in the knowledge base (`.vectalon/knowledge`),
 * so every CI failure becomes something the team brain learns from; sync it
 * with `vectalon sync --push` to share it across the team. Optional
 * `--telemetry <dir>` ingests crash exports so the triage is data-driven.
 */

import { existsSync } from 'fs'
import { resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { runCommand } from '../../adapters/runCommand'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TelemetryIngestionService } from '../../knowledge/telemetry'
import type { ParsedCrash } from '../../knowledge/telemetry'
import { fileCiGateIncident } from '../../sdlc'

interface CiIncidentOptions {
  gate?: string
  step?: string
  command?: string
  exit?: number
  output?: string
  commit?: string
  branch?: string
  severity?: string
  telemetry?: string
  json?: boolean
  dryRun?: boolean
}

/** Best-effort branch/commit resolution: flags first, then CI env, then git. */
async function resolveGitContext(
  root: string,
  explicit: { branch?: string; commit?: string }
): Promise<{ branch: string; commit: string | null }> {
  let branch = explicit.branch || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || ''
  let commit = explicit.commit || null
  try {
    if (!branch) {
      const b = await runCommand('git', ['branch', '--show-current'], { cwd: root })
      if (b.success) branch = b.stdout.trim()
    }
    if (!commit) {
      const c = await runCommand('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })
      if (c.success && c.stdout.trim()) commit = c.stdout.trim()
    }
  } catch (err) {
    // Git context is best-effort — the incident still files without it.
  }
  return { branch: branch || 'current', commit }
}

export async function ciIncidentCommand(directory: string, options: CiIncidentOptions): Promise<void> {
  const check = requireTier('pro', 'rn')
  if (!check.allowed) {
    logger.info('⚡ Self-healing CI gate requires Pro tier.')
    logger.info(`Current: ${check.currentTier} | Required: ${check.requiredTier}`)
    if (check.canTrial) {
      logger.info('')
      logger.info('🔄 Start 14-day Pro trial?')
      logger.info('   Run: npx vectalon auth --github')
      logger.info('   Or visit: https://vectalon.in/trial?product=rn')
    }
    logger.info('')
    logger.info('💳 Upgrade at: https://vectalon.in/pricing')
    process.exit(1)
  }

  const root = resolve(directory || process.cwd())
  const gate = options.gate || 'ci'
  const severity = options.severity === 'sev1' || options.severity === 'sev2' || options.severity === 'sev3'
    ? options.severity
    : undefined

  const { branch, commit } = await resolveGitContext(root, { branch: options.branch, commit: options.commit })

  // Optional crash correlation: ingest telemetry so the triage is data-driven.
  let crashes: ParsedCrash[] = []
  if (options.telemetry) {
    const dir = resolve(root, options.telemetry)
    if (existsSync(dir)) {
      const ingestStore = new ArtifactStore(root)
      const service = new TelemetryIngestionService(ingestStore)
      const result = service.ingestDirectory(dir)
      crashes = result.crashes as ParsedCrash[]
      logger.info(`Correlated ${crashes.length} crash(es) from telemetry`)
    } else {
      logger.warn(`Telemetry directory not found: ${options.telemetry}`)
    }
  }

  const store = options.dryRun ? undefined : new ArtifactStore(root)
  const result = fileCiGateIncident(
    {
      gate,
      step: options.step,
      command: options.command,
      exitCode: options.exit,
      output: options.output,
      branch,
      commit: commit || undefined,
      severity,
      crashes,
    },
    store
  )

  if (options.json) {
    logger.out(
      JSON.stringify(
        { incident: result.incident, rollback: result.rollback, artifactId: result.artifactId },
        null,
        2
      ) + '\n'
    )
    return
  }

  logger.out(result.report + '\n')
  if (result.artifactId) {
    logger.success(`Incident filed into the knowledge base (${result.artifactId})`)
  } else {
    logger.dim('Dry run — nothing persisted.')
  }
}
