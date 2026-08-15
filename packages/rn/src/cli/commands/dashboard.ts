/**
 * vectalon dashboard — Engineering Dashboard (Roadmap Phase 9, item 079)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Aggregates every agent report into one executive view + self-contained
 * HTML dashboard. --run regenerates the fast core reports first. --cron
 * keeps regenerating them (and the HTML) on a schedule until Ctrl-C.
 * Reports to docs/vectalon/dashboard/ (gitignored).
 */
import { execSync } from 'child_process'
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runDashboard, writeDashboardReport, dashboardCronTick, cronIntervalSeconds } from '../../dashboard'
import type { DashboardOptions, DashboardReport } from '../../dashboard'

export interface DashboardCommandOptions extends DashboardOptions {
  /** Print machine-readable output. */
  json?: boolean
  /** Open the HTML dashboard in the default browser. */
  open?: boolean
  /** Keep regenerating the fast core reports + HTML on a schedule. */
  cron?: boolean
  /** Cron regeneration interval in seconds (default 300). */
  interval?: number
}

/** Resolve on SIGINT/SIGTERM so the cron loop can exit gracefully. */
function waitForStopSignal(): Promise<'SIGINT' | 'SIGTERM'> {
  return new Promise(resolve => {
    const onSignal = (signal: 'SIGINT' | 'SIGTERM'): void => {
      process.removeListener('SIGINT', onInt)
      process.removeListener('SIGTERM', onTerm)
      resolve(signal)
    }
    const onInt = (): void => onSignal('SIGINT')
    const onTerm = (): void => onSignal('SIGTERM')
    process.once('SIGINT', onInt)
    process.once('SIGTERM', onTerm)
  })
}

async function openInBrowser(htmlPath: string): Promise<void> {
  try {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    execSync(`${opener} "${htmlPath}"`)
    logger.success('Opened the dashboard in your browser.')
  } catch {
    logger.warn('Could not open the browser automatically — open the HTML path above.')
  }
}

function renderTerminalSummary(report: DashboardReport): void {
  const color = report.overall === 'approved' ? pc.green : report.overall === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`Overall: ${color(report.overall)} | ${report.summary.agents} agents, ${report.summary.findings} findings (${report.summary.errors} err, ${report.summary.warnings} warn)`)
  logger.info('')
  for (const a of report.agents) {
    const c = a.verdict === 'approved' ? pc.green : a.verdict === 'needs-attention' ? pc.yellow : pc.red
    logger.info(`  ${c(a.verdict.padEnd(18))} ${a.agent.padEnd(16)} ${a.errors} err / ${a.warnings} warn / ${a.infos} info`)
  }
  logger.info('')
}

/** One `--cron` tick with a compact status line. */
async function cronTick(root: string, tickNo: number): Promise<void> {
  const startedAt = Date.now()
  const { report, paths } = await dashboardCronTick(root)
  const elapsedMs = Date.now() - startedAt
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const color = report.overall === 'approved' ? pc.green : report.overall === 'needs-attention' ? pc.yellow : pc.red
  logger.info(`[${stamp}] tick #${tickNo} — ${color(report.overall)} | ${report.summary.agents} agents, ${report.summary.findings} findings (${report.summary.errors} err, ${report.summary.warnings} warn) — ${elapsedMs} ms`)
  logger.dim(`  HTML: ${paths.htmlPath}`)
}

export async function dashboardCommand(directory: string, options: DashboardCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  // --- Cron mode: regenerate on a schedule until Ctrl-C -----------------
  if (options.cron) {
    const intervalSeconds = cronIntervalSeconds(options.interval)
    logger.info(pc.bold('vectalon dashboard — Engineering Dashboard (079) — cron mode'))
    logger.info(`project: ${root}`)
    logger.info(`Regenerating the fast core reports + HTML every ${intervalSeconds}s — Ctrl-C to stop`)
    logger.info('')
    const report = await runDashboard(root, { run: true })
    const { jsonPath, htmlPath } = writeDashboardReport(root, report)
    renderTerminalSummary(report)
    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    }
    logger.info(`Report: ${pc.dim(jsonPath)}`)
    logger.info(`HTML:   ${pc.dim(htmlPath)}`)
    if (options.open) await openInBrowser(htmlPath)

    let tickNo = 1
    try {
      await cronTick(root, tickNo)
    } catch (err) {
      logger.warn(`tick #${tickNo} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    const intervalMs = Math.max(1000, Math.round(intervalSeconds * 1000))
    // A ref'd interval keeps the process alive between ticks; the SIGINT/
    // SIGTERM listeners (waitForStopSignal) make Ctrl-C exit gracefully.
    const timer = setInterval(() => {
      tickNo += 1
      cronTick(root, tickNo).catch(err => {
        logger.warn(`tick #${tickNo} failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    }, intervalMs)
    await waitForStopSignal()
    clearInterval(timer)
    logger.success('Dashboard cron stopped')
    return
  }

  // --- One-shot mode ------------------------------------------------------
  const report = await runDashboard(root, { run: options.run })
  const { jsonPath, htmlPath } = writeDashboardReport(root, report)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  logger.info(pc.bold('vectalon dashboard — Engineering Dashboard (079)'))
  logger.info(`project: ${root}`)
  logger.info('')
  renderTerminalSummary(report)
  logger.info(`Report: ${pc.dim(jsonPath)}`)
  logger.info(`HTML:   ${pc.dim(htmlPath)}`)
  if (options.open) await openInBrowser(htmlPath)
}
