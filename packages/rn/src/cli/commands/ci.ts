/**
 * vectalon ci — Self-healing CI generation
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { ensureCiConfigs, detectCiProvider, PROVIDER_PATHS } from '../../adapters/ciTemplates'
import type { CiProvider } from '../../adapters/ciTemplates'

interface CiOptions {
  dryRun?: boolean
  /** Force a CI host instead of detecting from the git remote. */
  provider?: string
}

const VALID_PROVIDERS: CiProvider[] = ['github', 'azure', 'gitlab', 'bitbucket']
const PROVIDER_LABELS: Record<CiProvider, string> = {
  github: 'GitHub Actions',
  azure: 'Azure Pipelines',
  gitlab: 'GitLab CI',
  bitbucket: 'Bitbucket Pipelines',
}

function parseProvider(raw: string | undefined): CiProvider | null {
  if (!raw) return null
  if (VALID_PROVIDERS.includes(raw as CiProvider)) return raw as CiProvider
  logger.error(`Unknown CI provider: ${raw}`)
  logger.info(`Valid providers: ${VALID_PROVIDERS.join(', ')}`)
  process.exit(1)
}

function isExpoProject(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    return !!pkg.dependencies?.expo || !!pkg.devDependencies?.expo
  } catch {
    return false
  }
}

function isReactNativeCLIProject(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    return !!pkg.dependencies?.['react-native'] && !pkg.dependencies?.expo
  } catch {
    return false
  }
}

export async function ciCommand(directory: string, options: CiOptions): Promise<void> {
  const check = requireTier('pro', 'rn', 'ci')

  if (!check.allowed) {
    logger.info('⚡ Self-healing CI requires Pro tier.')
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
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const forced = parseProvider(options.provider)
  const provider = forced ?? detectCiProvider(root)

  logger.info('🔧 Self-healing CI Generator')
  logger.info(`   Detected project: ${isExpoProject(root) ? 'Expo' : isReactNativeCLIProject(root) ? 'React Native CLI' : 'unknown'}`)
  logger.info(`   CI host: ${PROVIDER_LABELS[provider]}${forced ? ' (forced)' : provider === 'github' && !forced ? ' (default — set a git remote or --provider to target another host)' : ''}`)

  if (options.dryRun) {
    logger.info('   (dry run — no files written)')
    if (isExpoProject(root)) {
      logger.info(`   Would write: .eas/workflows/vectalon.yml`)
    } else if (isReactNativeCLIProject(root)) {
      logger.info(`   Would write: ${PROVIDER_PATHS[provider]}`)
    }
    return
  }

  if (isExpoProject(root)) {
    const results = ensureCiConfigs(root, { isExpo: true })
    for (const file of results) {
      if (file.written) {
        logger.success(`Generated ${file.path}`)
      } else {
        logger.info(`${file.path} already exists — left untouched`)
      }
    }
    logger.success('CI workflow configured for Expo project (EAS Workflows)')
    return
  }

  if (isReactNativeCLIProject(root)) {
    const results = ensureCiConfigs(root, { isExpo: false, provider })
    for (const file of results) {
      if (file.written) {
        logger.success(`Generated ${file.path}`)
      } else {
        logger.info(`${file.path} already exists — left untouched`)
      }
    }
    logger.success(`CI workflow configured for bare React Native CLI project (${PROVIDER_LABELS[provider]})`)
    return
  }

  logger.warn('   Could not detect project type. Skipping CI generation.')
}
