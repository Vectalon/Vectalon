/**
 * vectalon suggestions — the visible, actionable surface for knowledge-refresh
 * improvement suggestions (outdated dependencies).
 *
 * Suggestions are persisted by KnowledgeRefreshService at
 * `.vectalon/knowledge/refresh/suggestions.json`; this command lists them,
 * prints them as JSON for CI/agents, applies one (npm install the latest
 * version — gated behind confirmation), and can render/open a self-contained
 * HTML dashboard.
 * Business Source License 1.1 (BSL-1.1)
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import type { ImprovementSuggestion } from '../../knowledge/refresh/types'
import { runCommand, type CommandResult } from '../../adapters/runCommand'
import { renderSuggestionsHtmlReport, installCommandFor } from '../../utils/suggestionsReport'
import { openInBrowser } from '../../utils/openBrowser'
import { readlineConfirm } from '../../utils/readlineConfirm'
import pkg from '../../../package.json'

interface SuggestionsOptions {
  json?: boolean
  limit?: number
  apply?: string
  yes?: boolean
  open?: boolean
  out?: string
  /** Injectable command runner (tests stub this to avoid real installs). */
  run?: (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<CommandResult>
}

const SEVERITY_ICON: Record<ImprovementSuggestion['severity'], string> = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}
const SEVERITY_ORDER: ImprovementSuggestion['severity'][] = ['error', 'warning', 'info']

/** Match a suggestion by full id, library name, or `dep-<library>-` id prefix. */
function findSuggestion(suggestions: ImprovementSuggestion[], ref: string): ImprovementSuggestion | undefined {
  return (
    suggestions.find(s => s.id === ref) ||
    suggestions.find(s => s.library === ref) ||
    suggestions.find(s => ref.startsWith('dep-') && s.id.startsWith(ref))
  )
}

export async function suggestionsCommand(directory: string, options: SuggestionsOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  if (!existsSync(join(root, '.vectalon'))) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const service = new KnowledgeRefreshService({ projectRoot: root })
  const all = service.getSuggestions()
  const suggestions = options.limit ? all.slice(0, options.limit) : all
  const lastRefreshAt = service.getLastRefreshAt() || undefined

  if (options.json) {
    process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), lastRefreshAt, suggestions }, null, 2) + '\n')
    return
  }

  if (options.apply) {
    await applySuggestion(root, all, options.apply, options)
    return
  }

  if (suggestions.length === 0) {
    logger.info('No improvement suggestions on file. Run `vectalon refresh` to check dependencies against the latest releases.')
  } else {
    logger.info(pc.bold(`vectalon suggestions — ${suggestions.length} improvement suggestion(s)`))
    logger.info('')
    for (const severity of SEVERITY_ORDER) {
      const group = suggestions.filter(s => s.severity === severity)
      if (group.length === 0) continue
      logger.info(pc.bold(pc.cyan(severity.toUpperCase())))
      for (const s of group) {
        const versionLine = s.currentVersion && s.latestVersion ? ` (${s.currentVersion} → ${s.latestVersion})` : ''
        logger.info(`  ${SEVERITY_ICON[s.severity]} ${s.title}${versionLine}`)
        logger.dim(`     ${s.description}`)
        logger.dim(`     apply: vectalon suggestions --apply ${s.library} --yes`)
      }
      logger.info('')
    }
    logger.dim('Regenerate with `vectalon refresh --force` · browse in the browser with --open')
  }

  if (options.open) {
    const outDir = resolve(root, options.out || '.vectalon/suggestions')
    mkdirSync(outDir, { recursive: true })
    const htmlPath = join(outDir, 'report.html')
    writeFileSync(
      htmlPath,
      renderSuggestionsHtmlReport({
        generatedAt: new Date().toISOString(),
        toolVersion: pkg.version,
        suggestions: all,
        lastRefreshAt,
      })
    )
    logger.success(`Suggestions dashboard: ${pc.dim(htmlPath)}`)
    openInBrowser(htmlPath)
    logger.info('Opened the dashboard in your browser.')
  }
}

/**
 * Apply one suggestion: prints the exact install command, then runs it only
 * with --yes or an interactive confirm (it mutates package.json — deliberate
 * gate). Non-TTY without --yes prints the command only.
 */
async function applySuggestion(
  root: string,
  suggestions: ImprovementSuggestion[],
  ref: string,
  options: SuggestionsOptions
): Promise<void> {
  const suggestion = findSuggestion(suggestions, ref)
  if (!suggestion) {
    logger.error(`Unknown suggestion "${ref}". Run \`vectalon suggestions\` to see the list.`)
    process.exit(1)
  }
  if (!suggestion.latestVersion) {
    logger.error(`Suggestion "${suggestion.library}" has no latest version to install — run \`vectalon refresh --force\` to regenerate.`)
    process.exit(1)
  }

  // One source of truth for the command: print it, then run exactly what was
  // printed (split the command string into argv) so they can never drift.
  const command = installCommandFor(suggestion)
  logger.info(`Suggestion: ${suggestion.title}`)
  logger.dim(`  ${suggestion.description}`)
  logger.info(`Command: ${command}`)

  const shouldRun =
    options.yes === true || (process.stdin.isTTY && (await readlineConfirm('Run this install now?')))
  if (!shouldRun) {
    logger.info('Not executed — re-run with --yes to apply without prompting (or run the command yourself).')
    return
  }

  const [cmd, ...args] = command.split(/\s+/)
  const run = options.run || runCommand
  const result = await run(cmd, args, {
    cwd: root,
    timeout: 10 * 60 * 1000,
  })
  if (result.success) {
    logger.success(`Installed ${suggestion.library}@^${suggestion.latestVersion}.`)
  } else {
    logger.error(`Install failed: ${result.stderr.trim().split(/\r?\n/)[0].slice(0, 160) || `exit ${result.exitCode}`}`)
    process.exit(1)
  }
}
