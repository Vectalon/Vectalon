/**
 * vectalon smoke — Post-release verification: run every CLI command and show
 * the full output. Business Source License 1.1 (BSL-1.1)
 *
 * Exercises the REAL command surface against the current project (Expo or
 * bare RN CLI), captures each command's complete stdout/stderr, classifies
 * pass / warn / skip / fail / timeout, and writes three artifacts to the
 * report directory:
 *   report.json  — structured runs (CI ingestion)
 *   report.log   — the full captured output of every command
 *   report.html  — a self-contained dashboard
 * Exits non-zero when any check fails or times out. Tier-gated and
 * input-dependent commands are reported as skips, never as failures.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { openInBrowser } from '../../utils/openBrowser'
import {
  runSmoke,
  cliEntry,
  detectFlavor,
  detectSourceFiles,
  renderJsonReport,
  renderActivityLog,
  renderHtmlReport,
  renderTerminalSummary,
  listSmokeChecks,
} from '../../smoke'

export interface SmokeOptions {
  list?: boolean
  only?: string
  skip?: string
  full?: boolean
  json?: boolean
  html?: boolean
  open?: boolean
  out?: string
  timeoutMs?: number
  /** Commander --no-dev: false when the user opts out; dev mode is the default. */
  dev?: boolean
}

export async function smokeCommand(directory: string, options: SmokeOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const only = options.only ? options.only.split(',').map(s => s.trim()).filter(Boolean) : undefined
  const skip = options.skip ? options.skip.split(',').map(s => s.trim()).filter(Boolean) : undefined

  if (options.list) {
    const checks = listSmokeChecks()
    const lines = checks.map(c => `${c.id.padEnd(14)} ${c.name}${c.slow ? '  [--full]' : ''}`)
    process.stdout.write(`vectalon smoke — ${checks.length} checks\n${lines.join('\n')}\n`)
    return
  }

  // Dev mode is ALWAYS on by default so every feature is exercised for real
  // (no license-gate skips). Opt out with --no-dev when a run should respect
  // the actual tier.
  const devMode = options.dev !== false
  logger.info(pc.bold(`vectalon smoke — @vectalon-dev/rn`))
  logger.info(`project: ${root}`)
  logger.info(`flavor: ${detectFlavor(root)}`)
  if (options.only) logger.info(`checks: ${options.only}`)
  if (options.skip) logger.info(`skipping: ${options.skip}`)
  if (options.full) logger.info('including slow / model-heavy checks (--full)')
  logger.info(devMode ? 'dev mode — all tier-gated features run for real (--no-dev to disable)' : 'tier mode — tier-gated checks report as skips (--dev enables)')
  logger.info('')

  const report = await runSmoke(
    {
      root,
      bin: cliEntry(),
      flavor: detectFlavor(root),
      srcFiles: detectSourceFiles(root),
      devMode,
    },
    { only, skip, full: options.full, timeoutMs: options.timeoutMs, devMode },
    // Live stream each check as it finishes.
    {
      onDone: run => {
        const icon = run.status === 'pass' ? pc.green('✔') : run.status === 'warn' ? pc.yellow('⚠') : run.status === 'skip' ? pc.cyan('○') : pc.red('✖')
        const reason = run.reason ? ` — ${run.reason}` : ''
        process.stderr.write(`  ${icon} ${run.check.id.padEnd(14)} ${run.check.name}${reason}\n`)
      },
    }
  )

  if (options.json) {
    process.stdout.write(renderJsonReport(report) + '\n')
    if (report.totals.fail > 0 || report.totals.timeout > 0) process.exit(1)
    return
  }

  const outDir = resolve(root, options.out || '.vectalon/smoke')
  const writeHtml = options.html !== false
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'report.json'), renderJsonReport(report))
  writeFileSync(join(outDir, 'report.log'), renderActivityLog(report))
  logger.success(`report.json + report.log written to ${pc.dim(outDir)}`)

  if (writeHtml) {
    const htmlPath = join(outDir, 'report.html')
    writeFileSync(htmlPath, renderHtmlReport(report))
    logger.success(`HTML dashboard written to ${pc.dim(htmlPath)}`)
    const shouldOpen = options.open === true || (options.open === undefined && process.stdin.isTTY)
    if (shouldOpen) {
      openInBrowser(htmlPath)
      logger.info('Opened the dashboard in your browser.')
    }
  }

  logger.info('')
  process.stdout.write(renderTerminalSummary(report) + '\n')
  logger.info('')

  const t = report.totals
  if (t.fail > 0 || t.timeout > 0) {
    logger.error(`${t.fail + t.timeout} check(s) failed — see ${pc.dim(join(outDir, 'report.log'))} for the full output.`)
    process.exit(1)
  }
  logger.success(`All ${t.pass} check(s) passed${t.warn > 0 ? `, ${t.warn} warned` : ''}${t.skip > 0 ? `, ${t.skip} skipped` : ''}.`)
}
