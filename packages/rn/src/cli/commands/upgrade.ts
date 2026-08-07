/**
 * vectalon upgrade — React Native / Expo upgrade copilot
 * Business Source License 1.1 (BSL-1.1)
 *
 * Detect → Catalog → Impact → Plan → Codemods → Verify, with tier gating
 * (Pro) and provenance logging. Deterministic: known migrations are
 * catalog-driven, no LLM.
 */

import { requireTier } from '@vectalon-dev/core'
import { resolve } from 'path'
import { readlineConfirm } from '../../utils/readlineConfirm'
import pc from 'picocolors'
import { logger } from '../logger'
import { runUpgrade } from '../../upgrade'
import { renderUpgradeReport } from '../../upgrade/report'

export interface UpgradeOptions {
  to?: string
  /** Preview changes without applying (default). */
  dryRun?: boolean
  /** Execute safe codemods + dependency bumps. */
  apply?: boolean
  /** Skip safety checks: apply review steps too, skip confirmation. */
  force?: boolean
  /** Print the report as JSON to stdout. */
  json?: boolean
  /** Run post-apply verification (doctor, typecheck, bundle gate). Default true. */
  verify?: boolean
}

export async function upgradeCommand(directory: string, options: UpgradeOptions): Promise<void> {
  const check = requireTier('pro', 'rn', 'upgrade')

  if (!check.allowed) {
    logger.info('⚡ Upgrade Copilot requires Pro tier.')
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
  const applying = options.apply === true && options.dryRun !== true

  // Confirmation gate (skipped by --force): applying without confirmation is
  // allowed in non-interactive contexts, but we surface the warning clearly.
  if (applying && !options.force && process.stdin.isTTY) {
    const proceed = await readlineConfirm(
      'This will modify files in your project (backups are kept under .vectalon/upgrades/backups/). Continue?'
    )
    if (!proceed) {
      logger.info('Aborted — nothing was changed.')
      return
    }
  }

  const report = await runUpgrade(root, {
    to: options.to,
    dryRun: options.dryRun !== true ? options.dryRun : true,
    apply: options.apply,
    force: options.force,
    verify: options.verify !== false,
    onProgress: (_phase, message) => {
      if (!options.json) logger.info(pc.dim(`   ${message}`))
    },
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    renderUpgradeReport(report)
  }

  // Exit codes: fatal detection errors, codemod failures, or failed verify.
  const fatal =
    report.errors.some(e => e.includes('No package.json') || e.includes('codemod')) ||
    (report.verify !== null && !report.verify.passed)
  if (fatal) {
    process.exit(1)
  }
  if (report.errors.length > 0) {
    logger.warn('Plan had advisory warnings — review the messages above.')
  }
}
