import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import { ensureCiConfigs } from '../../adapters/ciTemplates'
import { reportError } from '../../utils/safe'

interface CiOptions {
  // Reserved for future flags (e.g. --workflow <name>).
}

/**
 * `vectalon ci [directory]` — generate (or verify) the project's CI workflow:
 * EAS Workflows (`.eas/workflows/vectalon.yml`) for Expo projects, GitHub
 * Actions (`.github/workflows/vectalon-ci.yml`) for bare RN CLI projects.
 * Idempotent — an existing workflow is never overwritten.
 */
export async function ciCommand(directory: string, _options: CiOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  let isExpo = false
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    isExpo = Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo)
  } catch (err) {
    reportError(err, 'ci: reading package.json for expo detection')
  }

  const result = ensureCiConfigs(root, { isExpo })
  const platform = isExpo ? 'Expo' : 'bare React Native CLI'

  for (const file of result) {
    if (file.written) {
      logger.success(`Generated ${file.path}`)
    } else {
      logger.info(`${file.path} already exists — left untouched`)
    }
  }

  logger.success(`CI workflow configured for ${platform} project`)
}
