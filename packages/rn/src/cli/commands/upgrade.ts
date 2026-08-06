/**
 * vectalon upgrade — React Native / Expo upgrade copilot
 * Business Source License 1.1 (BSL-1.1)
 */

import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'

interface UpgradeOptions {
  to?: string
  dryRun?: boolean
  apply?: boolean
  force?: boolean
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

  logger.info('🔧 Upgrade Copilot')
  logger.info('   Detecting current version...')

  // TODO: Implement upgrade logic
  // 1. Detect current RN/Expo version from package.json
  // 2. Query npm registry for latest
  // 3. Load migration catalog
  // 4. Run impact analysis via AstScanner
  // 5. Apply codemods
  // 6. Run verification loop

  logger.info('   (Upgrade logic will be implemented in next phase)')
  logger.info(`   Target version: ${options.to || 'latest'}`)
  logger.info(`   Dry run: ${options.dryRun ? 'yes' : 'no'}`)
}
