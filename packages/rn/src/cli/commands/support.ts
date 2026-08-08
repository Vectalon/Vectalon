/**
 * vectalon support — Structured support bundles
 * Business Source License 1.1 (BSL-1.1)
 *
 * `vectalon support [directory] --upload` collects a sanitized support bundle
 * (logs, error queue, crash report, package.json, .vectalon state), stamps it
 * with a support token, and uploads it to the Vectalon support endpoint which
 * routes it to the support address. The token lets the user reference the
 * upload in a ticket instead of pasting logs manually.
 */
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import {
  buildSupportBundle,
  uploadSupportBundle,
  tokenForRoot,
  writeSupportBundle,
} from '../../diagnostics/support'
import { SUPPORT_RECIPIENT } from '../../diagnostics/errorReporter'

export interface SupportCommandOptions {
  upload?: boolean
  out?: string
}

export async function supportCommand(directory: string, options: SupportCommandOptions = {}): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (!options.upload) {
    logger.info('vectalon support — collect a structured bug report for the Vectalon team')
    logger.info('')
    logger.info('  Upload a sanitized support bundle (logs, error queue, crash report,')
    logger.info(`  package.json, .vectalon state) to our support pipeline (→ ${SUPPORT_RECIPIENT}):`)
    logger.info('')
    logger.info('    vectalon support --upload')
    logger.info('')
    logger.info('  You get a support token to paste into your ticket — no log-dump emails.')
    logger.info('  The bundle is written locally to .vectalon/support-bundle.json as well.')
    logger.info('  Privacy: secrets (API keys, tokens, credentials) are redacted before upload.')
    return
  }

  if (!existsSync(join(root, '.vectalon'))) {
    logger.warn('No .vectalon/ directory found — run `vectalon init` first. Continuing with what exists.')
  }

  const bundle = buildSupportBundle({ root, token: tokenForRoot(root) })
  const localPath = writeSupportBundle(root, bundle)
  logger.success(`Support bundle written to ${localPath}`)

  logger.info(`Uploading ${bundle.errorQueue.length} queued error event(s), ${bundle.logs.length} log line(s)…`)
  const uploaded = await uploadSupportBundle(bundle)
  if (uploaded) {
    logger.success(`Uploaded — support token ${uploaded}`)
    logger.info(`Reference this token in your ticket; our team follows up at ${SUPPORT_RECIPIENT}.`)
  } else {
    logger.warn('Upload failed (offline or endpoint unreachable) — the bundle is saved locally.')
    logger.info(`Share ${localPath} manually, or retry with: vectalon support --upload`)
  }
}
