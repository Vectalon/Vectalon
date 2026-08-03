import { resolve } from 'path'
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import Table from 'cli-table'
import pc from 'picocolors'
import { logger } from '../logger'
import { runDoctor, runDoctorFixes, type DoctorCheckers, type DoctorFixer, type FixAttempt, type ToolchainCheckOptions } from '../../ecosystem'

export interface DoctorOptions {
  json?: boolean
  /** Auto-install missing ecosystem items and toolchain components, then re-check. */
  fix?: boolean
  /** Injectable checkers — tests pass stubs so no real subprocesses run. */
  checkers?: DoctorCheckers
  /** Injectable fix runner — tests pass stubs so no real installs run. */
  fixer?: DoctorFixer
  /** Overrides for toolchain thresholds/ports (e.g. a custom Metro port). */
  toolchain?: ToolchainCheckOptions
}

/**
 * Real checkers backed by the local filesystem, PATH probes, and the
 * environment. Package resolution checks node_modules from the project root;
 * binary probes are bounded (5s) so a missing npx package never hangs the
 * command; the Metro port probe is bounded to 1s.
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
    env(name: string): string | undefined {
      return process.env[name]
    },
    portOpen(port: number): boolean {
      // Bounded synchronous probe: a tiny child node process tries to connect
      // to 127.0.0.1:port and exits 0 on success, 1 on error/timeout.
      const probe = [
        `const net=require('net');`,
        `const s=net.connect(${port},'127.0.0.1');`,
        `s.setTimeout(1000);`,
        `s.on('connect',()=>{s.destroy();process.exit(0)});`,
        `s.on('error',()=>process.exit(1));`,
        `s.on('timeout',()=>process.exit(1));`,
      ].join('')
      try {
        const result = spawnSync(process.execPath, ['-e', probe], {
          timeout: 3_000,
          stdio: 'ignore',
        })
        return result.status === 0
      } catch {
        return false
      }
    },
    platform: process.platform,
  }
}

/**
 * Real fixer that runs install commands in the project root with a generous
 * timeout (installs can take minutes). Bounded stdout capture keeps the report
 * readable; failures carry the first error line.
 */
function realFixer(root: string): DoctorFixer {
  return {
    run(command: string, args: string[], cwd?: string): { success: boolean; output: string } {
      try {
        const result = spawnSync(command, args, {
          cwd: cwd || root,
          encoding: 'utf-8',
          timeout: 10 * 60_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return {
          success: result.status === 0,
          output: (result.stdout || '') + (result.stderr || ''),
        }
      } catch (err) {
        return { success: false, output: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}

function renderFixTable(attempts: FixAttempt[]): void {
  const table = new Table({
    head: ['Status', 'Item', 'Command', 'Detail'],
    style: { head: ['cyan'] },
    colWidths: [14, 22, 46, 44],
  })
  for (const attempt of attempts) {
    const status =
      attempt.status === 'fixed' ? pc.green('FIXED') : attempt.status === 'failed' ? pc.red('FAILED') : pc.yellow('SKIPPED')
    table.push([status, attempt.name, attempt.label, attempt.detail])
  }
  process.stdout.write(table.toString() + '\n')
}

export function doctorCommand(directory: string, options: DoctorOptions): void {
  const root = resolve(directory || process.cwd())
  const hasEcosystem = existsSync(resolve(root, '.vectalon', 'ecosystem.json'))
  const checkers = options.checkers || realCheckers(root)
  let report = runDoctor(root, checkers, options.toolchain)

  if (options.fix && report.missingCount > 0) {
    logger.info(pc.bold('Attempting to fix missing checks…'))
    const { attempts, before, after } = runDoctorFixes(root, report, options.fixer || realFixer(root))
    renderFixTable(attempts)
    logger.info('')
    logger.info(`Fix summary: ${before} missing → ${after} missing`)
    logger.info('')
    // Re-run the full doctor with the original (env-aware) checkers so the
    // report reflects what the fixer installed.
    report = runDoctor(root, checkers, options.toolchain)
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.missingCount > 0 ? 1 : 0)
  }

  if (!hasEcosystem) {
    logger.warn('No .vectalon/ecosystem.json found — skipping ecosystem checks. Run `vectalon init` to enable them.')
  } else if (report.enabledCount === 0) {
    logger.warn('No ecosystem items enabled. Run `vectalon ecosystem --enable <id>` to opt in.')
  }

  logger.info(pc.bold(`vectalon doctor — ${report.enabledCount} enabled ecosystem item(s) + native toolchain`))
  logger.info('')

  if (report.checks.length > 0) {
    const table = new Table({
      head: ['Status', 'ID', 'Category', 'Detail', 'Hint'],
      style: { head: ['cyan'] },
      colWidths: [10, 22, 10, 52, 44],
    })

    for (const check of report.checks) {
      const statusColor =
        check.status === 'ok' ? pc.green('OK') : check.status === 'missing' ? pc.red('MISSING') : pc.yellow('WARN')
      table.push([statusColor, check.id, check.category, check.detail, check.hint || ''])
    }

    process.stdout.write(table.toString() + '\n')
    logger.info('')
  }

  logger.info(pc.bold('Native toolchain'))
  const toolchainTable = new Table({
    head: ['Status', 'Check', 'Detail', 'Hint'],
    style: { head: ['cyan'] },
    colWidths: [10, 26, 50, 46],
  })

  for (const check of report.toolchain) {
    const statusColor =
      check.status === 'ok' ? pc.green('OK') : check.status === 'missing' ? pc.red('MISSING') : pc.yellow('WARN')
    toolchainTable.push([statusColor, check.name, check.detail, check.hint || ''])
  }

  process.stdout.write(toolchainTable.toString() + '\n')
  logger.info('')

  if (report.missingCount === 0 && report.warningCount === 0) {
    logger.success(`All ${report.okCount} check(s) passed — toolchain and ecosystem are ready.`)
  } else {
    if (report.missingCount > 0) {
      logger.error(`${report.missingCount} check(s) missing: follow the hinted commands, then re-run \`vectalon doctor\`.`)
    }
    if (report.warningCount > 0) {
      logger.warn(`${report.warningCount} check(s) could not be fully verified (or are optional on this platform).`)
    }
  }

  if (report.missingCount > 0) {
    process.exit(1)
  }
}
