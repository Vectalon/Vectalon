/**
 * vectalon doctor — Ecosystem and toolchain diagnostics
 * Business Source License 1.1 (BSL-1.1)
 */

import { resolve } from 'path'
import { existsSync, accessSync, constants } from 'fs'
import { LicenseStore, LicenseValidator, TrialTracker } from '@vectalon-dev/core'
import { reportError } from '../../utils/safe'
import { spawnSync } from 'child_process'
import pc from 'picocolors'
import { logger } from '../logger'
import { renderTable, colorStatus } from '../table'
import { renderDoctorCard } from '../workflowReport'
import { getLogFilePath } from '../logfile'
import {
  runDoctor,
  runDoctorFixes,
  defensiveCheckers,
  runDoctorSelfTest,
  readEcosystemConfig,
  recommendEcosystemSetup,
  detectProjectFlavor,
  enableEcosystemItem,
  disableEcosystemItem,
  enableEcosystemItems,
  listEcosystemItems,
  checkCatalogPackagesOnRegistry,
  fixForMissing,
  type DoctorCheckers,
  type DoctorFixer,
  type FixAttempt,
  type DoctorCheckResult,
  type ToolchainCheckOptions,
  type LeaderboardCheckOptions,
  type ModelAccessCheckOptions,
  type RegistryCheck,
} from '../../ecosystem'
import { hasDownloadedModel } from '../../model/local/ModelStore'
import { getDefaultPreset } from '../../model/local/presets'
import type { ModelSetupProvider } from '../../model/setup'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'

export interface DoctorOptions {
  json?: boolean
  /** Auto-install missing ecosystem items and toolchain components, then re-check. */
  fix?: boolean
  /** Verify the doctor's own probes work (P0-10), then exit. */
  selftest?: boolean
  /** Toggle one ecosystem item on (write .vectalon/ecosystem.json) and exit. */
  enable?: string
  /** Toggle one ecosystem item off and exit. */
  disable?: string
  /** Enable every item recommended for the detected project flavor, then exit. */
  enableRecommended?: boolean
  /** Injectable checkers — tests pass stubs so no real subprocesses run. */
  checkers?: DoctorCheckers
  /** Injectable fix runner — tests pass stubs so no real installs run. */
  fixer?: DoctorFixer
  /** Overrides for toolchain thresholds/ports (e.g. a custom Metro port). */
  toolchain?: ToolchainCheckOptions
  /** Overrides for nightly-leaderboard readiness (e.g. a custom local model). */
  leaderboard?: LeaderboardCheckOptions
  /** Overrides for model-access checks (e.g. a custom provider/preset). */
  model?: ModelAccessCheckOptions
  /**
   * Injectable npm-registry status provider for the catalog-health checks.
   * Defaults to the cache-backed registry fetch, skipped under NODE_ENV=test.
   */
  catalogRegistryProvider?: () => Promise<Record<string, RegistryCheck> | undefined>
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
      } catch (err) {
        reportError(err, `doctor: resolving package ${packageName}`)
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
      } catch (err) {
        reportError(err, 'doctor: running toolchain probe')
        return { success: false, output: '' }
      }
    },
    dirExists(dir: string): boolean {
      return existsSync(dir)
    },
    env(name: string): string | undefined {
      return process.env[name]
    },
    hasModel(presetId: string): boolean {
      return hasDownloadedModel(presetId)
    },
    writable(dir: string): boolean {
      try {
        accessSync(dir, constants.W_OK)
        return true
      } catch (err) {
        reportError(err, `doctor: checking writability of ${dir}`)
        return false
      }
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
      } catch (err) {
        reportError(err, `doctor: probing port ${port}`)
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
  const rows = attempts.map(a => [
    a.status === 'fixed' ? pc.green('FIXED') : a.status === 'failed' ? pc.red('FAILED') : pc.yellow('SKIPPED'),
    a.name,
    a.label,
    a.detail,
  ])
  process.stdout.write(renderTable(rows as Array<Array<string | number>>, { head: ['Status', 'Item', 'Command', 'Detail'] }) + '\n')
}

function statusCell(check: DoctorCheckResult): string {
  return colorStatus(check.status === 'ok' ? 'OK' : check.status === 'missing' ? 'MISSING' : 'WARN')
}

/** Render a doctor section's 4-column table (toolchain/leaderboard/model). */
function renderSectionTable(head: string[], rows: DoctorCheckResult[]): void {
  const table = rows.map(c => [statusCell(c), c.name, c.detail, c.hint || ''])
  process.stdout.write(renderTable(table as Array<Array<string | number>>, { head }) + '\n')
}

/**
 * Missing ecosystem tool/hook items are OPTIONAL extras: the agent loop never
 * blocks on them (a missing zustand/flashlist only matters if the project
 * adopts the library; husky/lefthook are git hygiene). Missing mcp/skill items
 * are agent infrastructure the enabled config actually relies on. Renders the
 * two kinds differently so a wall of 23 identical "install with: npx …" rows
 * collapses into the handful of real gaps.
 */
function isOptionalExtra(check: DoctorCheckResult): boolean {
  return (check.category === 'tool' || check.category === 'hook') && check.status === 'missing'
}

/**
 * One-line verdict right under the header — what actually needs attention vs
 * what is nice-to-have — instead of burying the summary under four tables.
 */
function renderVerdict(missing: number, coreMissing: number, optionalMissing: number, warnings: number, ok: number): void {
  if (missing === 0 && warnings === 0) {
    logger.success(`All ${ok} check(s) passed — toolchain and ecosystem are ready.`)
    return
  }
  const parts: string[] = []
  if (missing > 0) {
    const label = optionalMissing > 0 ? ` (${coreMissing} the agent needs · ${optionalMissing} optional)` : ''
    parts.push(pc.red(`✖ ${missing} check(s) missing${label}`))
  }
  if (warnings > 0) parts.push(pc.yellow(`${warnings} warning(s)`))
  if (ok > 0) parts.push(pc.dim(`${ok} ok`))
  logger.info(parts.join(' · '))
}

/** Collapsed one-line summary of the passing ecosystem items. */
function renderOkSummary(ok: DoctorCheckResult[]): void {
  if (ok.length === 0) return
  logger.info(pc.dim(`✓ ${ok.length} ok: ${ok.map(c => c.id).join(', ')}`))
  logger.info('')
}

/**
 * Numbered fix steps for every missing check — the "clear steps to fix" ask,
 * rendered as a structured failure card (✖ header, auto/manual tags, log
 * pointer) that mirrors the workflow failure card.
 */
function renderFixCard(root: string, missing: DoctorCheckResult[], warnings: number, okCount: number): void {
  if (missing.length === 0) return
  const items = missing.map((check) => {
    const fix = fixForMissing(check, root)
    return {
      id: check.id,
      name: check.name,
      category: check.category,
      detail: check.detail,
      fixLabel: fix ? fix.label : check.hint || check.detail,
      manual: fix ? fix.manual : true,
    }
  })
  const autoCount = items.filter(i => !i.manual).length
  logger.info('')
  process.stdout.write(renderDoctorCard({ missing: items, warnings, okCount, autoCount, logFile: getLogFilePath() }) + '\n')
  logger.info('')
}

/** Recommended-but-not-enabled ecosystem items for the detected flavor. */
function recommendedNotEnabled(root: string): DoctorCheckResult[] {
  const config = readEcosystemConfig(root)
  const recommended = recommendEcosystemSetup(detectProjectFlavor(root))
  return recommended
    .filter(item => !config.enabled.includes(item.id))
    .map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      flavor: item.flavor,
      status: 'warning' as const,
      detail: item.description,
      hint: `Enable: \`vectalon doctor --enable ${item.id}\``,
    }))
}

export async function doctorCommand(directory: string, options: DoctorOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  const hasEcosystem = existsSync(resolve(root, '.vectalon', 'ecosystem.json'))
  const continueExit = (code: number): never => process.exit(code)

  // Quick toggles: `--enable <id>` / `--disable <id>` / `--enable-recommended`.
  if (options.enable) {
    const result = enableEcosystemItem(root, options.enable)
    if (!result.enabled) {
      logger.error(result.message)
      continueExit(1)
    }
    logger.success(result.message)
    logger.dim(`Config written to ${result.path}`)
    return
  }
  if (options.disable) {
    const result = disableEcosystemItem(root, options.disable)
    logger.success(result.message)
    return
  }
  if (options.enableRecommended) {
    const { enabled, path } = enableEcosystemItems(root, recommendEcosystemSetup(detectProjectFlavor(root)).map(i => i.id))
    logger.success(`Enabled ${enabled.length} recommended ecosystem item(s) for this project.`)
    logger.dim(`Config written to ${path}`)
    return
  }

  // P0-10: every probe runs through safe() so a single broken probe (missing
  // native module, broken binary) degrades that one check — never the report.
  const checkers = defensiveCheckers(options.checkers || realCheckers(root))

  if (options.selftest) {
    const results = runDoctorSelfTest(root, checkers)
    const table = results.map(r => [r.ok ? pc.green('OK') : pc.red('BROKEN'), r.name, r.detail])
    process.stdout.write(renderTable(table as Array<Array<string | number>>, { head: ['Status', 'Probe', 'Detail'] }) + '\n')
    logger.info('')
    const broken = results.filter(r => !r.ok)
    if (broken.length === 0) {
      logger.success(`Doctor self-test passed — all ${results.length} probes work.`)
    } else {
      logger.error(`${broken.length} doctor probe(s) are broken — reports using them will silently degrade.`)
      continueExit(1)
    }
    return
  }
  const leaderboardOptions = { localModelPresetId: getDefaultPreset().id, ...(options.leaderboard || {}) }
  // The configured model provider comes from .vectalon/rn-vectalon.json (set by
  // `vectalon init`); the doctor warns when that model can't reach tools.
  const resolvedProvider = resolveProjectModelProvider(root) as ModelSetupProvider
  const projectModelConfig = resolveProjectModelConfig(root)
  const modelOptions: ModelAccessCheckOptions = {
    provider: resolvedProvider,
    modelPresetId: getDefaultPreset().id,
    ...(projectModelConfig?.apiKeyEnv ? { apiKeyEnv: projectModelConfig.apiKeyEnv } : {}),
    ...(options.model || {}),
  }
  const doctorOptions: ToolchainCheckOptions & LeaderboardCheckOptions & ModelAccessCheckOptions & { catalogRegistry?: Record<string, RegistryCheck> } = {
    ...(options.toolchain || {}),
    ...leaderboardOptions,
    ...modelOptions,
  }

  // Catalog health: precompute npm-registry status for every ENABLED MCP item
  // (cache-backed, best-effort — offline just skips the checks). Caught before
  // serve would otherwise surface a stale entry as an npx 404 wall. Never runs
  // under NODE_ENV=test (or with no enabled MCPs) unless a provider is
  // injected — the await is skipped entirely then, keeping the command
  // synchronous for tests.
  let catalogRegistry: Record<string, RegistryCheck> | undefined
  if (options.catalogRegistryProvider) {
    catalogRegistry = await options.catalogRegistryProvider()
  } else if (process.env.NODE_ENV !== 'test') {
    const enabledMcpPackages = listEcosystemItems()
      .filter(i => i.category === 'mcp' && readEcosystemConfig(root).enabled.includes(i.id))
      .map(i => i.packageName)
      .filter((p): p is string => !!p)
    if (enabledMcpPackages.length > 0) {
      try {
        catalogRegistry = await checkCatalogPackagesOnRegistry(enabledMcpPackages, { root })
      } catch (err) {
        reportError(err, 'doctor: checking catalog packages on the registry')
      }
    }
  }
  if (catalogRegistry) {
    doctorOptions.catalogRegistry = catalogRegistry
  }

  let report = runDoctor(root, checkers, doctorOptions)

  if (options.fix && report.missingCount > 0) {
    logger.info(pc.bold('Attempting to fix missing checks…'))
    const { attempts, before, after } = runDoctorFixes(root, report, options.fixer || realFixer(root))
    renderFixTable(attempts)
    logger.info('')
    logger.info(`Fix summary: ${before} missing → ${after} missing`)
    logger.info('')
    // Re-run the full doctor with the original (env-aware) checkers so the
    // report reflects what the fixer installed.
    report = runDoctor(root, checkers, doctorOptions)
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    continueExit(report.missingCount > 0 ? 1 : 0)
  }

  if (!hasEcosystem) {
    logger.warn('No .vectalon/ecosystem.json found — skipping ecosystem checks. Run `vectalon init` to enable them.')
  } else if (report.enabledCount === 0) {
    logger.warn('No ecosystem items enabled. Run `vectalon doctor --enable-recommended` to enable the recommended set for this project.')
  }

  const flavorLabel = report.flavor === 'expo' ? 'Expo project' : report.flavor === 'rn-cli' ? 'bare RN-CLI project' : 'project'
  logger.info(pc.bold(`vectalon doctor — ${flavorLabel} · ${report.enabledCount} enabled ecosystem item(s) + native toolchain + nightly leaderboard + model access`))
  logger.info('')

  // Verdict first: what needs attention (split core vs optional), so the four
  // tables below never bury the answer.
  const allMissing = [...report.checks, ...report.toolchain, ...report.leaderboard, ...report.model].filter(c => c.status === 'missing')
  const optionalMissing = report.checks.filter(isOptionalExtra).length
  renderVerdict(
    report.missingCount,
    allMissing.length - optionalMissing,
    optionalMissing,
    report.warningCount,
    report.okCount
  )
  logger.info('')

  if (report.checks.length > 0) {
    const coreGaps = report.checks.filter(c => c.status !== 'ok' && !isOptionalExtra(c))
    const optionalExtras = report.checks.filter(isOptionalExtra)
    const okChecks = report.checks.filter(c => c.status === 'ok')

    // Agent infrastructure (MCP servers + skills) — full detail; a missing
    // one means the enabled config can't do its job.
    if (coreGaps.length > 0) {
      logger.info(pc.bold('The agent needs these'))
      const table = coreGaps.map(c => [statusCell(c), c.id, c.category, c.detail, c.hint || ''])
      process.stdout.write(renderTable(table as Array<Array<string | number>>, { head: ['Status', 'ID', 'Category', 'Detail', 'Hint'] }) + '\n')
      logger.info('')
    }

    // Optional tooling (dev tools + repo hooks) — one compact line each; a
    // missing one only matters if the project adopts it.
    if (optionalExtras.length > 0) {
      logger.info(pc.bold(`Optional tooling (${optionalExtras.length}) — used only when your project needs it`))
      const table = optionalExtras.map(c => [pc.dim('⚠'), c.id, c.hint || c.detail])
      process.stdout.write(renderTable(table as Array<Array<string | number>>, { head: ['', 'Item', 'Install'], colWidths: [1, 24, 80] }) + '\n')
      logger.info('')
    }

    renderOkSummary(okChecks)
  }

  // Recommended-but-not-enabled section — the "future vision / easy enable" ask.
  const recommended = recommendedNotEnabled(root)
  if (recommended.length > 0) {
    logger.info(pc.bold(`Recommended for this ${report.flavor === 'expo' ? 'Expo' : report.flavor === 'rn-cli' ? 'RN-CLI' : 'RN'} project (not enabled)`))
    const table = recommended.map(c => [pc.cyan('—'), c.id, c.category, c.detail, c.hint || ''])
    process.stdout.write(renderTable(table as Array<Array<string | number>>, { head: ['', 'ID', 'Category', 'What it gives you', 'Enable'] }) + '\n')
    logger.info('')
  }

  logger.info(pc.bold('Native toolchain'))
  renderSectionTable(['Status', 'Check', 'Detail', 'Hint'], report.toolchain)
  logger.info('')

  logger.info(pc.bold('Nightly leaderboard readiness (M5)'))
  renderSectionTable(['Status', 'Check', 'Detail', 'Hint'], report.leaderboard)
  logger.info('')

  logger.info(pc.bold('Model access (tools / MCP / skills / web intel)'))
  renderSectionTable(['Status', 'Check', 'Detail', 'Hint'], report.model)
  logger.info('')

  // Clear numbered fix steps for everything that's missing — a structured
  // failure card with auto/manual tags and a log pointer. (The card is the
  // canonical fix list; the Optional tooling section above is the compact view.)
  renderFixCard(root, allMissing, report.warningCount, report.okCount)

  // Upgrade readiness check
  logger.info('')
  logger.info(pc.bold('Upgrade Readiness'))
  logger.info('-----------------')
  const license = LicenseStore.read()
  const trial = TrialTracker.getInfo()
  if (license && license.key && LicenseValidator.validate(license.key).valid) {
    const days = LicenseValidator.daysRemaining(license)
    logger.info(`✅ License active (${days} days remaining)`)
  } else if (trial && TrialTracker.isActive()) {
    logger.info(`🔄 Trial active (${TrialTracker.daysRemaining()} days remaining)`)
  } else {
    logger.info(`ℹ️  Free tier — upgrade at https://vectalon.in/pricing`)
  }

  if (report.missingCount === 0 && report.warningCount === 0) {
    logger.success(`All ${report.okCount} check(s) passed — toolchain and ecosystem are ready.`)
  } else {
    if (report.missingCount > 0) {
      logger.error(`${report.missingCount} check(s) missing: follow the numbered Fix steps above, then re-run \`vectalon doctor\`.`)
    }
    if (report.warningCount > 0) {
      logger.warn(`${report.warningCount} check(s) could not be fully verified (or are optional on this platform).`)
    }
  }

  if (report.missingCount > 0) {
    continueExit(1)
  }
}