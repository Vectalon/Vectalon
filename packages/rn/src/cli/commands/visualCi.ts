/**
 * vectalon visual-ci — PR-mode visual regression
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { runCommand } from '../../adapters/runCommand'
import { createAdapters } from '../../adapters'
import { DeviceController, detectDevicePlatform } from '../../adapters/deviceControl'
import type { DevicePlatform } from '../../adapters/deviceControl'
import { ReferenceStore, visualBaselineDir } from '../../utils/referenceStore'
import {
  runVisualCi,
  deriveScreenKeys,
  VISUAL_CI_COMMENT_MARKER,
} from '../../visualCi/runner'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { fileCiGateIncident } from '../../sdlc'

interface VisualCiCliOptions {
  base?: string
  screens?: string
  changed?: string
  platform?: string
  attempts?: number
  settleMs?: number
  verdict?: string
  pr?: number
  push?: boolean
  out?: string
  json?: boolean
  dryRun?: boolean
  incident?: boolean
}

function defaultBase(): string {
  return process.env.GITHUB_BASE_REF || 'origin/main'
}

/** Changed files: --changed, else git diff base...HEAD, else the working tree. */
async function resolveChangedFiles(root: string, base: string): Promise<string[]> {
  const split = (stdout: string): string[] => stdout.split('\n').map(s => s.trim()).filter(Boolean)
  const viaBase = await runCommand('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root })
  if (viaBase.success) return split(viaBase.stdout)
  const working = await runCommand('git', ['diff', '--name-only', 'HEAD'], { cwd: root })
  if (working.success) return split(working.stdout)
  return []
}

function resolvePlatform(root: string, raw: string | undefined): DevicePlatform {
  if (raw === 'android' || raw === 'ios') return raw
  return detectDevicePlatform(root)
}

export async function visualCiCommand(directory: string, options: VisualCiCliOptions): Promise<void> {
  const check = requireTier('pro', 'rn')

  if (!check.allowed) {
    logger.info('⚡ PR-mode visual CI requires Pro tier.')
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
  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const platform = resolvePlatform(root, options.platform)
  const base = options.base || defaultBase()
  const changedFiles = options.changed
    ? options.changed.split(',').map(s => s.trim()).filter(Boolean)
    : await resolveChangedFiles(root, base)
  const screens = options.screens
    ? options.screens.split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  const outDir = resolve(root, options.out || '.vectalon/visual-ci')
  const store = new ReferenceStore(root, { dir: visualBaselineDir(root) })
  const derived = screens || deriveScreenKeys(root, changedFiles)
  const baselines = derived
    .map(key => ({ key, baseline: store.get(key) }))
    .filter(e => e.baseline !== null) as Array<{ key: string; baseline: NonNullable<ReturnType<ReferenceStore['get']>> }>

  if (options.dryRun) {
    const plan = {
      dryRun: true,
      platform,
      base,
      changedFiles,
      screens: derived,
      baselines: baselines.map(e => ({ key: e.key, platform: e.baseline.platform, quarantined: !!e.baseline.quarantine })),
    }
    if (options.json) {
      logger.out(JSON.stringify(plan, null, 2) + '\n')
      return
    }
    logger.info('🔍 Visual CI — dry run')
    logger.info(`   Platform: ${platform} | Base: ${base}`)
    logger.info(`   Changed files: ${changedFiles.length > 0 ? changedFiles.join(', ') : '(none resolved)'}`)
    logger.info(`   Screens to check: ${derived.length > 0 ? derived.join(', ') : '(none affected)'}`)
    for (const entry of baselines) {
      logger.info(`   ${entry.key}: baseline ${entry.baseline.platform}${entry.baseline.quarantine ? ' (quarantined)' : ''}`)
    }
    for (const key of derived) {
      if (!baselines.some(e => e.key === key)) logger.warn(`   ${key}: NO baseline — will be proposed (never gates)`)
    }
    return
  }

  logger.info('🔬 Visual CI')
  logger.info(`   Platform: ${platform} | Base: ${base} | Screens: ${derived.length}`)

  const adapters = createAdapters({ root, git: { push: options.push === true } })
  const outcome = await runVisualCi({
    root,
    store,
    device: new DeviceController(root, { platform }),
    changedFiles,
    screens,
    platform,
    attempts: options.attempts,
    settleMs: options.settleMs,
    verdict: (options.verdict as 'strict' | 'warn' | 'report' | undefined),
    outDir,
    pr: options.pr,
    commenter: options.pr
      ? (number, body) => adapters.git.upsertPullRequestComment(number, VISUAL_CI_COMMENT_MARKER, body)
      : undefined,
  })

  // Self-healing: a regression gate failure becomes a triaged incident in the
  // knowledge base. Infra failures (exit 2) are reported, never filed — there
  // is nothing to roll back when a simulator could not boot.
  if (options.incident && outcome.exitCode === 1) {
    let branch: string | undefined
    try {
      const b = await runCommand('git', ['branch', '--show-current'], { cwd: root })
      if (b.success && b.stdout.trim()) branch = b.stdout.trim()
    } catch (err) {
      // Best-effort — the incident files without a branch.
    }
    const incident = fileCiGateIncident(
      {
        gate: 'visual-regression',
        exitCode: outcome.exitCode,
        output: outcome.report,
        branch,
      },
      new ArtifactStore(root)
    )
    logger.warn('Visual regression gate failed — incident filed into the knowledge base:')
    logger.warn(`  ${incident.incident.severity} · ${incident.incident.probableCause}`)
    if (incident.rollback.command) {
      logger.warn(`  Rollback: ${incident.rollback.command}`)
    }
  }

  if (options.json) {
    logger.out(JSON.stringify({ passed: outcome.passed, exitCode: outcome.exitCode, runs: outcome.runs }, null, 2) + '\n')
  } else {
    logger.out(outcome.report + '\n')
    if (options.pr) {
      logger.info(`Posted visual regression comment on PR #${options.pr}`)
    }
  }

  process.exit(outcome.exitCode)
}
