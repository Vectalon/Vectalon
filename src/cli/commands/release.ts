import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { logger } from '../logger'
import { planRelease, renderReleasePlan } from '../../sdlc/ReleasePlanner'
import { monitorRelease } from '../../sdlc/CrashMonitor'
import { TelemetryIngestionService } from '../../knowledge/telemetry'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { ensureReleaseConfigs } from '../../adapters/releaseTemplates'
import { runCommand } from '../../adapters/runCommand'
import { reportError } from '../../utils/safe'
import type { ParsedCrash } from '../../knowledge/telemetry'

interface ReleaseOptions {
  version?: string
  bump?: string
  changelog?: boolean
  submit?: boolean
  monitor?: boolean
  telemetry?: string
  baseline?: number
  hours?: number
  json?: boolean
}

/**
 * `vectalon release [directory]` — the autonomous release & monitor pipeline:
 *
 * 1. Detect the version bump from git history and generate the changelog.
 * 2. `--submit` writes the release workflow (E2E on device farm + store
 *    submission: EAS for Expo, GitHub Actions for bare RN CLI).
 * 3. `--monitor` ingests telemetry (Crashlytics / Sentry) for the window and
 *    auto-files an incident with a rollback suggestion when the crash rate
 *    spikes above the baseline.
 */
export async function releaseCommand(directory: string, options: ReleaseOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  // -- 1. Version bump + changelog -- //
  const currentVersion = options.version || readVersion(root)
  const logOutput = await readGitLog(root)
  const plan = planRelease(currentVersion, logOutput)

  if (options.changelog) {
    logger.out(plan.changelog + '\n')
    return
  }

  // -- 2. Release workflow (E2E + submission) -- //
  let submitted = false
  if (options.submit) {
    const isExpo = isExpoProject(root)
    const result = ensureReleaseConfigs(root, { isExpo })
    for (const file of result) {
      if (file.written) {
        logger.success(`Generated ${file.path}`)
        submitted = true
      } else {
        logger.info(`${file.path} already exists — left untouched`)
      }
    }
  }

  // -- 3. Monitor -- //
  if (options.monitor) {
    const store = new ArtifactStore(root)
    const service = new TelemetryIngestionService(store)
    const dir = options.telemetry
      ? resolve(root, options.telemetry)
      : TelemetryIngestionService.findDefaultDir(root)

    if (dir && existsSync(dir)) {
      const result = service.ingestDirectory(dir)
      logger.info(`Monitored ${result.crashes.length} crash(es) in ${result.filesScanned} telemetry file(s)`)
      const monitor = monitorRelease(result.crashes as ParsedCrash[], {
        baselineRate: options.baseline ?? null,
        windowHours: options.hours ?? 24,
      })
      logger.out(monitor.report + '\n')
      if (monitor.incident) {
        logger.warn('Crash-rate spike detected — review the incident and consider rollback.')
      }
    } else {
      logger.warn('No telemetry exports found for monitoring. Pass --telemetry <dir> or drop exports into .vectalon/telemetry.')
    }
  }

  // -- Output -- //
  if (options.json) {
    logger.out(JSON.stringify({ plan, submitted }, null, 2) + '\n')
    return
  }
  logger.out(renderReleasePlan(plan) + '\n')
  if (submitted) {
    logger.success('Release workflow written — E2E on device farm + store submission will run on the next release.')
  }
}

function readVersion(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { version?: string }
    return pkg.version || '0.0.0'
  } catch (err) {
    reportError(err, 'release: reading package.json version')
    return '0.0.0'
  }
}

function isExpoProject(root: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo)
  } catch (err) {
    reportError(err, 'release: reading package.json for expo detection')
    return false
  }
}

async function readGitLog(root: string): Promise<string> {
  try {
    const result = await runCommand('git', ['log', '--oneline', '-50'], { cwd: root })
    return result.stdout
  } catch (err) {
    reportError(err, 'release: reading git log')
    return ''
  }
}
