/**
 * vectalon selftest — Test every feature of the harness with a visible report
 * Business Source License 1.1 (BSL-1.1)
 *
 * Runs the feature catalog in isolated temp sandboxes (never touches the
 * user's project), then writes three artifacts to the report directory:
 *   report.json  — the raw report (CI ingestion)
 *   report.log   — the full activity trace: every step, command, and file write
 *   report.html  — a self-contained dashboard you can open in a browser
 * Exits non-zero when any check fails.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { spawn } from 'child_process'
import pc from 'picocolors'
import { logger } from '../logger'
import {
  runSelfTest,
  listFeatureChecks,
  renderTerminalSummary,
  renderActivityLog,
  renderHtmlReport,
  renderJsonReport,
  SELF_TEST_CATEGORIES,
  LiveProgressReporter,
} from '../../selftest'
import type { ModelProviderChoice, SelfTestCategory } from '../../selftest'

const MODEL_PROVIDERS: ModelProviderChoice[] = ['local', 'wasm', 'openai', 'anthropic']

export interface SelftestOptions {
  category?: string
  only?: string
  model?: string
  requireModel?: boolean
  list?: boolean
  json?: boolean
  html?: boolean
  open?: boolean
  out?: string
  verbose?: boolean
}

function printCheckList(): void {
  const grouped = new Map<string, { id: string; name: string }[]>()
  for (const check of listFeatureChecks()) {
    const list = grouped.get(check.category) || []
    list.push({ id: check.id, name: check.name })
    grouped.set(check.category, list)
  }
  const lines: string[] = []
  lines.push(pc.bold(`vectalon selftest — ${listFeatureChecks().length} checks across ${grouped.size} categories`))
  lines.push('')
  for (const [category, checks] of grouped) {
    lines.push(pc.cyan(pc.bold(category.toUpperCase())))
    for (const c of checks) {
      lines.push(`  ${c.id.padEnd(32)} ${c.name}`)
    }
    lines.push('')
  }
  process.stdout.write(lines.join('\n') + '\n')
}

function openInBrowser(path: string): void {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path]
  try {
    spawn(opener, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    // opening the browser is best-effort
  }
}

export async function selftestCommand(directory: string, options: SelftestOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const category = options.category as SelfTestCategory | undefined
  if (category && !SELF_TEST_CATEGORIES.includes(category)) {
    logger.error(`Unknown category "${category}". Valid: ${SELF_TEST_CATEGORIES.join(', ')}`)
    process.exit(1)
  }
  if (options.only) {
    const matches = listFeatureChecks().filter(c => c.id === options.only)
    if (matches.length === 0) {
      logger.error(`Unknown check id "${options.only}". Run \`vectalon selftest --list\` to see all checks.`)
      process.exit(1)
    }
  }
  if (options.model && !MODEL_PROVIDERS.includes(options.model as ModelProviderChoice)) {
    logger.error(`Unknown model provider "${options.model}". Valid: ${MODEL_PROVIDERS.join(', ')}`)
    process.exit(1)
  }

  if (options.list) {
    printCheckList()
    return
  }

  logger.info(pc.bold(`vectalon selftest — @vectalon-dev/rn`))
  if (options.category) logger.info(`category: ${options.category}`)
  if (options.only) logger.info(`check: ${options.only}`)
  if (options.model) logger.info(`model provider: ${options.model}${options.requireModel ? ' (required)' : ''}`)
  logger.info('')

  // Stream results live as each check finishes (spinner + progress bar in a
  // TTY, plain status lines otherwise) so failures are visible immediately.
  // `--json` keeps stderr quiet for CI consumers that parse stdout.
  const streaming = options.json !== true
  const progress = streaming ? new LiveProgressReporter() : null
  progress?.start(listFeatureChecks({ category, only: options.only }).length)
  const report = await runSelfTest(
    {
      category,
      only: options.only,
      modelProvider: options.model as ModelProviderChoice | undefined,
      requireModel: options.requireModel,
      projectRoot: root,
    },
    streaming
      ? {
          onStart: check => progress!.onCheckStart(check),
          onDone: run => progress!.onCheckDone(run),
        }
      : undefined
  )
  progress?.finish()

  // Live terminal echo of every step when --verbose.
  if (options.verbose) {
    for (const run of report.runs) {
      for (const step of run.steps) {
        process.stderr.write(`  ${step.message}\n`)
      }
    }
  }

  if (options.json) {
    process.stdout.write(renderJsonReport(report) + '\n')
    if (report.totals.fail > 0) process.exit(1)
    return
  }

  const outDir = resolve(root, options.out || '.vectalon/selftest')
  const writeHtml = options.html !== false
  mkdirSync(outDir, { recursive: true })

  writeFileSync(join(outDir, 'report.json'), renderJsonReport(report))
  writeFileSync(join(outDir, 'report.log'), renderActivityLog(report))
  logger.success(`report.json + report.log written to ${pc.dim(outDir)}`)

  if (writeHtml) {
    const htmlPath = join(outDir, 'report.html')
    writeFileSync(htmlPath, renderHtmlReport(report))
    logger.success(`HTML dashboard written to ${pc.dim(htmlPath)}`)
    const shouldOpen = options.open === true || (options.open === undefined && process.stdin.isTTY && options.html !== false)
    if (shouldOpen) {
      openInBrowser(htmlPath)
      logger.info('Opened the dashboard in your browser.')
    }
  }

  logger.info('')
  // Per-check lines already streamed live — print a compact final summary.
  process.stdout.write(renderTerminalSummary(report) + '\n')
  logger.info('')

  const t = report.totals
  if (t.fail > 0) {
    logger.error(`${t.fail} check(s) failed — see ${pc.dim(join(outDir, 'report.html'))} or report.log for the failing steps.`)
    process.exit(1)
  }
  if (t.warn > 0) {
    logger.warn(`${t.warn} check(s) warned (optional dependencies or environment limits).`)
  }
  logger.success(`All ${t.pass} check(s) passed${existsSync(join(outDir, 'report.html')) ? ` — dashboard: ${join(outDir, 'report.html')}` : ''}.`)
}
