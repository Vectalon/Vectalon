import { resolve } from 'path'
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import Table from 'cli-table'
import pc from 'picocolors'
import { logger } from '../logger'
import { runEcosystemDoctor, type DoctorCheckers } from '../../ecosystem'

export interface DoctorOptions {
  json?: boolean
}

/**
 * Real checkers backed by the local filesystem and PATH probes. Package
 * resolution checks node_modules from the project root; binary probes are
 * bounded (5s) so a missing npx package never hangs the command.
 */
function realCheckers(root: string): DoctorCheckers {
  return {
    packageInstalled(packageName: string): boolean {
      try {
        require.resolve(`${packageName}/package.json`, { paths: [root] })
        return true
      } catch {
        return false
      }
    },
    run(command: string, args: string[]): { success: boolean; output: string } {
      try {
        const result = spawnSync(command, args, {
          encoding: 'utf-8',
          timeout: 5_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return {
          success: result.status === 0,
          output: (result.stdout || '') + (result.stderr || ''),
        }
      } catch {
        return { success: false, output: '' }
      }
    },
    dirExists(dir: string): boolean {
      return existsSync(dir)
    },
  }
}

export function doctorCommand(directory: string, options: DoctorOptions): void {
  const root = resolve(directory || process.cwd())

  if (!existsSync(resolve(root, '.vectalon', 'ecosystem.json'))) {
    logger.error('No .vectalon/ecosystem.json found. Run `vectalon init` or `vectalon ecosystem --enable <id>` first.')
    process.exit(1)
  }

  const report = runEcosystemDoctor(root, realCheckers(root))

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.missingCount > 0 ? 1 : 0)
  }

  if (report.enabledCount === 0) {
    logger.warn('No ecosystem items enabled. Run `vectalon ecosystem --enable <id>` to opt in.')
    return
  }

  logger.info(pc.bold(`vectalon doctor — ${report.enabledCount} enabled ecosystem item(s)`))
  logger.info('')

  const table = new Table({
    head: ['Status', 'ID', 'Category', 'Detail', 'Hint'],
    style: { head: ['cyan'] },
    colWidths: [10, 22, 10, 52, 44],
  })

  for (const check of report.checks) {
    const statusColor =
      check.status === 'ok' ? pc.green('OK') : check.status === 'missing' ? pc.red('MISSING') : pc.yellow('WARN')
    table.push([
      statusColor,
      check.id,
      check.category,
      check.detail,
      check.hint || '',
    ])
  }

  process.stdout.write(table.toString() + '\n')

  logger.info('')
  if (report.missingCount === 0 && report.warningCount === 0) {
    logger.success(`All ${report.okCount} enabled item(s) are installed and reachable.`)
  } else {
    if (report.missingCount > 0) {
      logger.error(`${report.missingCount} item(s) missing: run the hinted install command, then re-run \`vectalon doctor\`.`)
    }
    if (report.warningCount > 0) {
      logger.warn(`${report.warningCount} item(s) could not be fully verified.`)
    }
  }

  if (report.missingCount > 0) {
    process.exit(1)
  }
}
