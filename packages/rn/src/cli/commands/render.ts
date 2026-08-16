/**
 * vectalon render — compile + headless-render generated code in the sandbox
 * Business Source License 1.1 (BSL-1.1)
 *
 * Usage:
 *   vectalon render [dir] --entry src/App.tsx [--file src/Home.tsx ...]
 *
 * Transpiles the given TS/TSX files (project Babel when available, offline
 * TypeScript otherwise), follows the entry's relative import graph like
 * Metro, renders the entry headlessly inside the V-1 sandbox (scrubbed env,
 * network denied, timeout/memory bounded), and prints console logs, the
 * render tree, and any load/runtime errors — before any diff is presented.
 * Curated Expo/navigation/animation packages (expo-status-bar, expo,
 * safe-area context, react-navigation, gesture-handler, reanimated,
 * expo-font, screens, linear-gradient, constants, vector-icons,
 * expo-router + stack/tabs/link subpaths) resolve to built-in stubs;
 * anything else unresolvable surfaces as a load error. Pro tier.
 */

import { existsSync, readFileSync } from 'fs'
import { relative, resolve } from 'path'
import { requireTier } from '@vectalon-dev/core'
import { logger } from '../logger'
import { renderInSandbox, renderRenderResult } from '../../render'
import type { RenderFile } from '../../render'

export interface RenderCommandOptions {
  /** Entry file to render (required). */
  entry?: string
  /** Extra files to compile alongside the entry (repeatable, comma-separated). */
  file?: string[] | string
  /** Wall-clock timeout in ms. */
  timeout?: number
  /** Virtual memory limit in MB. */
  memory?: number
  /** JSON output. */
  json?: boolean
}

/**
 * Normalize `--file` values. Commander delivers a single option as a plain
 * string (and the CLI registration collects repeated flags into an array), so
 * accept both shapes and split on commas (trimmed, empties dropped).
 */
export function normalizeRenderFiles(file: string[] | string | undefined): string[] {
  if (!file) return []
  const list = Array.isArray(file) ? file : [file]
  return list.flatMap(f => f.split(',')).map(f => f.trim()).filter(Boolean)
}

/**
 * Sanitize a numeric CLI option (`--timeout`, `--memory`). Commander's
 * `Number` processor turns garbage input into NaN, and `NaN ?? default` is
 * NaN — a NaN timeout makes `setTimeout` fire immediately (instant kill) and
 * a NaN cap disables output capping. Treat non-finite / non-positive values
 * as "not provided" so defaults apply instead.
 */
export function normalizeRenderLimit(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export async function renderCommand(directory: string, options: RenderCommandOptions): Promise<void> {
  const check = requireTier('pro', 'rn')

  if (!check.allowed) {
    logger.info('⚡ Metro-aware execution sandbox requires Pro tier.')
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
  const entry = options.entry
  if (!entry) {
    logger.error('Pass --entry <file> (e.g. src/App.tsx) — the file to compile and render headlessly.')
    process.exit(1)
  }

  const paths = [entry, ...normalizeRenderFiles(options.file)].map(p => resolve(root, p))
  const files: RenderFile[] = []
  for (const p of paths) {
    if (!existsSync(p)) {
      logger.error(`File not found: ${p}`)
      process.exit(1)
    }
    const content = readFileSync(p, 'utf-8')
    files.push({ path: relative(root, p), content })
  }

  const result = await renderInSandbox({
    files,
    entry: relative(root, resolve(root, entry)),
    projectRoot: root,
    timeoutMs: normalizeRenderLimit(options.timeout),
    memoryMb: normalizeRenderLimit(options.memory),
  })

  // Failure must be observable via the exit code in BOTH output modes — a
  // script consuming `--json` relies on it the same way a human reads the
  // tree.
  if (!result.ok) {
    process.exitCode = 1
  }

  if (options.json) {
    logger.out(JSON.stringify(result, null, 2) + '\n')
    return
  }

  logger.out(renderRenderResult(result) + '\n')
}
