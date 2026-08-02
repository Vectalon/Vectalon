import { resolve, join } from 'path'
import { existsSync } from 'fs'
import { logger } from '../logger'
import { createArtifactSync, readSyncConfig, writeSyncConfig } from '../../knowledge/artifactSync'

export interface SyncCommandOptions {
  push?: boolean
  pull?: boolean
  remote?: string
  branch?: string
  force?: boolean
  init?: boolean
}

export async function syncCommand(directory: string, options: SyncCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  if (options.init) {
    const remote = options.remote
    if (!remote) {
      logger.error('--init requires --remote <url>')
      process.exit(1)
    }
    const path = writeSyncConfig(root, {
      remote,
      branch: options.branch || 'main',
      enabled: true,
    })
    logger.success(`Created artifact sync config at ${path}`)
    logger.info('Run `vectalon sync --push` to push the team brain, or `--pull` to fetch it.')
    return
  }

  const sync = createArtifactSync(root, {
    remote: options.remote,
    branch: options.branch,
    force: options.force,
  })

  if (!sync) {
    logger.error('No .vectalon/sync.json found. Run `vectalon sync --init --remote <url>` first.')
    process.exit(1)
  }

  try {
    const result = options.pull
      ? await sync.pull({ remote: options.remote, branch: options.branch, force: options.force })
      : await sync.push({ remote: options.remote, branch: options.branch, force: options.force })

    if (result.pushed || result.pulled) {
      logger.success(result.message)
    } else {
      logger.error(result.message)
      process.exit(1)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(message)
    process.exit(1)
  }
}

export function printSyncStatus(root: string): void {
  const config = readSyncConfig(root)
  if (!config) {
    logger.info('Artifact sync: not configured (run `vectalon sync --init --remote <url>`)')
    return
  }
  logger.info(`Artifact sync: ${config.remote}@${config.branch}${config.enabled === false ? ' (disabled)' : ''}`)
}
