/**
 * vectalon auth — Manage license and trial
 * Business Source License 1.1 (BSL-1.1)
 */

import { LicenseStore, LicenseValidator } from '@vectalon-dev/core'
import { logger } from '../logger'
import { pollTrialDeviceFlow, startTrialDeviceFlow } from '../../auth/trialDeviceFlow'
import { activateTrial, clearTrial, trialDaysRemaining, trialStatus } from '../../auth/trialState'

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
    clearTrial()
    logger.info('👋 Logged out. Reverted to free tier.')
    return
  }

  if (options.github) {
    await authenticateTrial()
    return
  }

  // Default: show status
  const license = LicenseStore.read()
  const trial = trialStatus()

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
  } else if (trial.status === 'active' && trial.credential) {
    logger.info(`🔄 Trial: ${trial.credential.tier}`)
    logger.info(`   Days remaining: ${trialDaysRemaining(trial)}`)
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

async function authenticateTrial(): Promise<void> {
  const origin = process.env.VECTALON_API_URL || 'https://vectalon.in'
  let challenge
  try { challenge = await startTrialDeviceFlow(fetch, origin) } catch {
    logger.error('Trial sign-in is currently unavailable. Try again later.')
    process.exitCode = 1
    return
  }
  logger.info(`Open ${challenge.verificationUri}`)
  logger.info(`Enter code: ${challenge.userCode}`)
  const deadline = Date.now() + challenge.expiresIn * 1000
  let interval = challenge.interval
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000))
    const result = await pollTrialDeviceFlow(fetch, origin, challenge.deviceCode)
    if (result.status === 'pending') continue
    if (result.status === 'slow_down') { interval = result.interval; continue }
    if (result.status === 'complete') {
      const status = activateTrial(result.credential)
      if (status.status === 'active') { logger.success(`14-day Pro trial activated (${trialDaysRemaining(status)} days remaining).`); return }
      logger.error(`Trial credential rejected: ${status.reasonCode}`)
      process.exitCode = 1
      return
    }
    logger.error(result.status === 'denied' ? 'GitHub sign-in was denied.' : 'Trial sign-in expired or is unavailable.')
    process.exitCode = 1
    return
  }
  logger.error('GitHub sign-in expired. Run the command again for a new code.')
  process.exitCode = 1
}
