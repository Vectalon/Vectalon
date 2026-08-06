/**
 * vectalon auth — Manage license and trial
 * Business Source License 1.1 (BSL-1.1)
 */

import { LicenseStore, LicenseValidator, TrialTracker } from '@vectalon-dev/core'
import { logger } from '../logger'

interface AuthOptions {
  license?: string
  github?: boolean
  status?: boolean
  logout?: boolean
}

export async function authCommand(options: AuthOptions): Promise<void> {
  if (options.license) {
    const validation = LicenseValidator.validate(options.license)
    if (validation.valid && validation.license) {
      LicenseStore.write(validation.license)
      logger.info(`✅ License activated: ${validation.license.tier} tier`)
      logger.info(`   Expires: ${new Date(validation.license.expiresAt).toISOString().split('T')[0]}`)
      logger.info(`   Products: ${Array.isArray(validation.license.product) ? validation.license.product.join(', ') : validation.license.product}`)
    } else {
      logger.error(`❌ Invalid license: ${validation.error}`)
      process.exit(1)
    }
    return
  }

  if (options.logout) {
    LicenseStore.clear()
    LicenseStore.clearTrial()
    logger.info('👋 Logged out. Reverted to free tier.')
    return
  }

  if (options.github) {
    logger.info('🔐 GitHub authentication...')
    logger.info('   (OAuth device flow will be implemented here)')
    logger.info('   Visit: https://vectalon.in/trial to start a trial')
    return
  }

  // Default: show status
  const license = LicenseStore.read()
  const trial = TrialTracker.getInfo()

  logger.info('📊 Authentication Status')
  logger.info('')

  if (license && license.key) {
    const validation = LicenseValidator.validate(license.key)
    if (validation.valid && validation.license) {
      logger.info(`✅ License: ${validation.license.tier}`)
      logger.info(`   Product: ${Array.isArray(validation.license.product) ? validation.license.product.join(', ') : validation.license.product}`)
      logger.info(`   Expires: ${new Date(validation.license.expiresAt).toISOString().split('T')[0]} (${LicenseValidator.daysRemaining(validation.license)} days remaining)`)
    } else {
      logger.info(`⚠️  License invalid: ${validation.error}`)
    }
  } else if (trial && TrialTracker.isActive()) {
    logger.info(`🔄 Trial: ${trial.tier}`)
    logger.info(`   Days remaining: ${TrialTracker.daysRemaining()}`)
    logger.info(`   GitHub: ${trial.githubUsername || 'unknown'}`)
  } else {
    logger.info('ℹ️  Free tier (no license or trial)')
  }

  logger.info('')
  logger.info('Commands:')
  logger.info('  vectalon auth --license <key>    Activate license')
  logger.info('  vectalon auth --github           Authenticate with GitHub')
  logger.info('  vectalon auth --logout           Clear license')
  logger.info('')
  logger.info('Get a license: https://vectalon.in/pricing')
  logger.info('Start a trial: https://vectalon.in/trial')
}
