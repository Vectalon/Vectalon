/**
 * UpgradeTools — MCP tools for the upgrade copilot.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Agents can plan upgrades (deterministic, catalog-driven) and apply safe
 * codemods. `apply_upgrade` skips the heavy verification loop (Metro build,
 * tsc) — those stay on the CLI so MCP stays fast and side-effect-light.
 */

import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { runUpgrade, planUpgrade, detectVersions, describeDetection, parseRnDiff, fetchRnDiffPurge, rnDiffPurgeUrl } from '../../upgrade'
import type { UpgradeReport } from '../../upgrade'

const SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project root (default: cwd)' },
    to: { type: 'string', description: 'Target: RN "0.76", Expo SDK "53", or "latest" (default: latest known stable)' },
  },
}

/** Compact projection so agent-visible JSON stays small (no file contents). */
function compact(report: UpgradeReport): Record<string, unknown> {
  return {
    root: report.root,
    target: report.target,
    tooling: report.tooling,
    detected: describeDetection(report.from),
    newArchBefore: report.newArchBefore?.enabled ?? null,
    newArchAfter: report.newArchAfter?.enabled ?? null,
    riskLabel: report.riskLabel,
    totalRisk: report.totalRisk,
    autoSteps: report.autoSteps,
    reviewSteps: report.reviewSteps,
    manualSteps: report.manualSteps,
    steps: report.steps.map(s => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      risk: s.risk,
      category: s.category,
      editCount: s.edits.length,
      manual: s.manual,
    })),
    impact: report.impact.map(f => ({ file: f.file, pattern: f.pattern, risk: f.risk, category: f.category })),
    provenance: report.provenance,
    errors: report.errors,
  }
}

export class UpgradeTools extends ToolRegistry {
  @mcpTool(
    'plan_upgrade',
    'Plan a React Native / Expo upgrade: detect current versions (package.json, Podfile, gradle.properties), run AST-grade breaking-change impact analysis (native modules, bridge usage, New Architecture hazards), and produce a step-by-step migration plan with risk scoring. Deterministic — no model calls, no file writes.',
    SCHEMA
  )
  async planUpgradeTool(args: Record<string, unknown>): Promise<string> {
    const directory = typeof args.directory === 'string' && args.directory ? args.directory : process.cwd()
    const to = typeof args.to === 'string' && args.to ? args.to : undefined
    return JSON.stringify(compact(planUpgrade(directory, { to, dryRun: true })), null, 2)
  }

  @mcpTool(
    'apply_upgrade',
    'Apply a planned React Native / Expo upgrade: executes the safe codemods and dependency bumps on disk (backups kept under .vectalon/upgrades/backups/, provenance manifest written), optionally with --force for review steps. Returns the applied edits. Verification is not run here — use the CLI for the full verify loop.',
    {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Project root (default: cwd)' },
        to: { type: 'string', description: 'Target: RN "0.76", Expo SDK "53", or "latest"' },
        force: { type: 'boolean', description: 'Also apply review steps (New Architecture flips, SDK level bumps)' },
      },
    }
  )
  async applyUpgradeTool(args: Record<string, unknown>): Promise<string> {
    // Destructive write path: never default to cwd. Requiring an explicit
    // directory keeps accidental repo-root applies impossible. Throwing marks
    // the MCP result as an error so clients treat it as a failure.
    const directory = typeof args.directory === 'string' && args.directory ? args.directory : ''
    if (!directory) {
      throw new Error(
        'apply_upgrade requires a "directory" argument (the project root). Refusing to default to cwd — this tool writes files.'
      )
    }
    const to = typeof args.to === 'string' && args.to ? args.to : undefined
    const report = await runUpgrade(directory, {
      to,
      apply: true,
      force: args.force === true,
      dryRun: false,
      verify: false,
    })
    return JSON.stringify(compact(report), null, 2)
  }

  @mcpTool(
    'get_rn_upgrade_diff',
    'Fetch the official rn-diff-purge template diff for a from→to React Native upgrade and categorize every changed file as native (android/, ios/, Gemfile) vs JS/TS (App.tsx, index.js, babel/metro/ts config, package.json) vs other — the exact template changes to apply for a CLI app upgrade, live from rn-diff-purge (always current, works for versions newer than Vectalon\'s catalog). Pass the raw unified diff in `diff` to parse offline deterministically.',
    {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Current React Native version (e.g. 0.72.5)' },
        to: { type: 'string', description: 'Target React Native version (e.g. 0.86.2)' },
        diff: { type: 'string', description: 'Optional: the raw unified diff content to parse instead of fetching (deterministic, offline)' },
        timeoutMs: { type: 'number', description: 'Fetch timeout in ms (default 15000)' },
      },
      required: ['from', 'to'],
    }
  )
  async getRnUpgradeDiffTool(args: Record<string, unknown>): Promise<string> {
    const from = typeof args.from === 'string' ? args.from : ''
    const to = typeof args.to === 'string' ? args.to : ''
    if (!from || !to) {
      return JSON.stringify({ error: 'get_rn_upgrade_diff requires from and to versions (e.g. from=0.72.5 to=0.86.2)' }, null, 2)
    }
    const raw = typeof args.diff === 'string' && args.diff ? args.diff : null
    try {
      if (raw) {
        // Deterministic offline mode: parse the caller-provided diff.
        return JSON.stringify(parseRnDiff(raw, from, to), null, 2)
      }
      const timeoutMs = typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : undefined
      const summary = await fetchRnDiffPurge(from, to, timeoutMs ? { timeoutMs } : {})
      return JSON.stringify(summary, null, 2)
    } catch (err) {
      // Soft failure: report the error + hints inline instead of throwing so
      // agents can fall back to pasting the diff content.
      return JSON.stringify(
        {
          error: err instanceof Error ? err.message : String(err),
          hint: `Fetch the diff manually from ${rnDiffPurgeUrl(from, to)} (or the Upgrade Helper) and pass its content in \`diff\`.`,
        },
        null,
        2
      )
    }
  }

  @mcpTool(
    'detect_upgrade_state',
    'Detect the current React Native / Expo versions and native configuration of a project (react-native, expo SDK, Hermes, New Architecture, SDK levels). Deterministic and side-effect free.',
    SCHEMA
  )
  async detectUpgradeState(args: Record<string, unknown>): Promise<string> {
    const directory = typeof args.directory === 'string' && args.directory ? args.directory : process.cwd()
    const versions = detectVersions(directory)
    return JSON.stringify(
      {
        detected: describeDetection(versions),
        rnVersion: versions.rnVersion,
        expoVersion: versions.expoVersion,
        tooling: versions.tooling,
        newArchEnabled: versions.newArch?.enabled ?? null,
        turboModuleSpecs: versions.newArch?.turboModuleSpecs ?? [],
        hermesEnabled: versions.android.hermesEnabled,
        kotlinVersion: versions.android.kotlinVersion,
        compileSdkVersion: versions.android.compileSdkVersion,
        minSdkVersion: versions.android.minSdkVersion,
      },
      null,
      2
    )
  }
}
