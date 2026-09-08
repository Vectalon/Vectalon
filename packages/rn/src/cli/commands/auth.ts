/**
 * vectalon auth — Manage license and trial
 * Business Source License 1.1 (BSL-1.1)
 */

import { LicenseStore } from '@vectalon-dev/core'
import { logger } from '../logger'
import { pollTrialDeviceFlow, startTrialDeviceFlow } from '../../auth/trialDeviceFlow'
import { activateTrial, clearTrial, trialDaysRemaining, trialStatus } from '../../auth/trialState'
import { customerLicenseStore, describeLicenseStatus, verifyCustomerLicense, type LicenseCredentialVerifier, type LicenseLifecycleStore } from '../../auth/licenseLifecycle'
import { LicenseGatewayClient } from '../../auth/licenseGateway'

interface AuthOptions {
  license?: string
  github?: boolean
  status?: boolean
  logout?: boolean
  refresh?: boolean
  recover?: boolean
}

export interface AuthCommandDependencies {
  store?: LicenseLifecycleStore
  verify?: LicenseCredentialVerifier
  gateway?: Pick<LicenseGatewayClient, 'refresh'>
}

export async function authCommand(options: AuthOptions, dependencies: AuthCommandDependencies = {}): Promise<void> {
  const store = dependencies.store ?? customerLicenseStore()
  const verify = dependencies.verify ?? verifyCustomerLicense
  if (options.license) {
    const stored = store.save(options.license, verify)
    if (stored.ok) {
      const record = store.read()
      const validation = record.ok ? verify(record.record.token, record.record) : null
      if (validation?.ok) {
        logger.info(`✅ License activated: ${validation.tier} tier`)
        logger.info(`   Expires: ${new Date(validation.expiresAt).toISOString().split('T')[0]}`)
      } else logger.info('✅ License activated.')
    } else {
      logger.error(`❌ License activation failed: ${stored.code}`)
      process.exitCode = 1
    }
    return
  }

  if (options.logout) {
    store.clear()
    LicenseStore.clear()
    clearTrial()
    logger.info('👋 Logged out. Reverted to free tier.')
    return
  }

  if (options.github) {
    await authenticateTrial()
    return
  }

  if (options.recover) {
    const migration = store.migrateLegacy(verify)
    if (!migration.ok) {
      logger.error(`License recovery failed: ${migration.code}`)
      process.exitCode = 1
      return
    }
    const recovered = store.readVerified(verify)
    if (recovered.ok && recovered.recovered) logger.warn('Recovered the prior verified license record.')
    else if (recovered.ok) logger.info('A verified local license record is already available.')
    else logger.warn('No recoverable local license record was found.')
    if (recovered.ok) await refreshStoredLicense(store, verify, dependencies.gateway ?? new LicenseGatewayClient(), false)
    return
  }

  if (options.refresh) {
    await refreshStoredLicense(store, verify, dependencies.gateway ?? new LicenseGatewayClient(), true)
    return
  }

  // Default: show status
  const migration = store.migrateLegacy(verify)
  const license = store.readVerified(verify)
  const trial = trialStatus()

  logger.info('📊 Authentication Status')
  logger.info('')

  if (!migration.ok) {
    logger.warn(`License storage needs recovery: ${migration.code}`)
  } else if (license.ok) {
    const validation = license.check
    const status = describeLicenseStatus(validation)
    logger.info(`${status.access === 'granted' ? '✅' : status.access === 'warning' ? '⚠️' : '⛔'} License: ${status.state}`)
    if (validation.ok) {
      logger.info(`   Tier: ${validation.tier}`)
      logger.info(`   Expires: ${new Date(validation.expiresAt).toISOString().split('T')[0]}`)
    }
    logger.info(`   ${status.message}`)
    if (license.recovered) logger.warn('Using a recoverable prior record; refresh when online.')
  } else if (trial.status === 'active' && trial.credential) {
    logger.info(`🔄 Trial: ${trial.credential.tier}`)
    logger.info(`   Days remaining: ${trialDaysRemaining(trial)}`)
  } else {
    logger.info('ℹ️  Free tier (no license or trial)')
  }

  logger.info('')
  logger.info('Commands:')
  logger.info('  vectalon auth --license <key>    Activate license')
  logger.info('  vectalon auth --status           Show explicit license lifecycle status')
  logger.info('  vectalon auth --refresh          Refresh license while online')
  logger.info('  vectalon auth --recover          Recover a prior local license record')
  logger.info('  vectalon auth --github           Authenticate with GitHub')
  logger.info('  vectalon auth --logout           Clear local license and trial')
  logger.info('')
  logger.info('Get a license: https://vectalon.in/pricing')
  logger.info('Start a trial: https://vectalon.in/trial')
}

/** Refresh validates a replacement before the atomic store can publish it. */
async function refreshStoredLicense(
  store: LicenseLifecycleStore,
  verify: LicenseCredentialVerifier,
  gateway: Pick<LicenseGatewayClient, 'refresh'>,
  explicit: boolean,
): Promise<void> {
  const stored = store.read()
  if (!stored.ok) {
    if (explicit) {
      logger.error('License refresh requires a stored license. Activate or recover a license first.')
      process.exitCode = 1
    }
    return
  }
  const refreshed = await gateway.refresh(stored.record.token)
  if (!refreshed.ok) {
    const message = refreshed.code === 'offline' || refreshed.code === 'timeout'
      ? 'License refresh is unavailable while offline. Your existing bounded lease remains in effect until it expires.'
      : `License refresh failed: ${refreshed.code}`
    if (explicit) {
      logger.error(message)
      process.exitCode = 1
    } else logger.warn(message)
    return
  }
  const saved = store.save(refreshed.credential, verify)
  if (!saved.ok) {
    const status = describeLicenseStatus(verify(refreshed.credential, stored.record))
    logger.error(`License refresh rejected: ${status.state}`)
    if (explicit) process.exitCode = 1
    return
  }
  logger.success('License refreshed securely.')
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
