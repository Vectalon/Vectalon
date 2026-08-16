/**
 * vc mode — the deployment-mode surface (Cloud / Private / Air-gapped).
 * Business Source License 1.1 (BSL-1.1)
 *
 * The commercial differentiator: your source code stays inside your
 * environment. Shows the current mode (from .vectalon/rn-vectalon.json),
 * verifies the configured provider is inside it, and lays out the whole
 * privacy ladder — cloud (hosted models) → private (company-controlled LLM)
 * → air-gapped (local model, nothing leaves the machine).
 */
import { resolve, join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { logger } from '../logger'
import { readProjectManifest } from '../../projectManifest'
import { MODES, MODE_IDS, modeAllows, verifyMode, describeProvider, isDeploymentMode, MODE_DEFAULT_PROVIDER, MODE_PROVIDERS } from '../../model/mode'
import type { ModelSetupProvider } from '../../model/setup'

export interface ModeCommandOptions {
  /** Set the deployment mode (cloud | private | air-gapped). */
  set?: string
  /** Print machine-readable output. */
  json?: boolean
}

/** The privacy ladder body — one row per mode. */
export function renderModeLadder(current: string): string[] {
  const lines: string[] = []
  for (const id of MODE_IDS) {
    const def = MODES[id]
    const marker = id === current ? pc.bold('▶ ') : '  '
    const label = id === current ? pc.bold(def.label) : def.label
    lines.push(`${marker}${label} — ${def.tagline}`)
    lines.push(`      ${dim(def.runsWhere)}`)
    lines.push(`      ${dim(def.leaves)}`)
    lines.push(`      ${dim(def.stays)}`)
    if (id !== MODE_IDS[MODE_IDS.length - 1]) lines.push('')
  }
  return lines
}

export async function modeCommand(options: ModeCommandOptions): Promise<void> {
  const root = resolve(process.cwd())

  // --set: write the deployment mode into the manifest.
  if (options.set) {
    const mode = options.set.toLowerCase()
    if (!isDeploymentMode(mode)) {
      logger.error(`Unknown deployment mode: ${options.set} — valid modes: ${MODE_IDS.join(', ')}`)
      return
    }
    const manifest = readProjectManifest(root)
    const provider = manifest?.modelProvider as ModelSetupProvider | undefined
    if (provider && !modeAllows(mode, provider)) {
      logger.error(`${provider} is not allowed in ${mode} mode — allowed: ${MODE_PROVIDERS[mode].join(', ')}`)
      logger.dim(`  Switch the provider first: vc init --model ${MODE_DEFAULT_PROVIDER[mode]} (or edit .vectalon/rn-vectalon.json)`)
      return
    }
    // Rewrite the manifest preserving every other field.
    const path = join(root, '.vectalon', 'rn-vectalon.json')
    mkdirSync(join(root, '.vectalon'), { recursive: true })
    const next = { ...(manifest ?? {}), deploymentMode: mode }
    writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
    logger.success(`Deployment mode set to ${mode}.`)
    logger.dim(`  ${MODES[mode].tagline} — ${MODES[mode].runsWhere}`)
    if (!provider) {
      logger.dim(`  No model provider configured yet — run vc init (defaults to ${MODE_DEFAULT_PROVIDER[mode]}).`)
    }
    return
  }

  const result = verifyMode(root)

  if (options.json) {
    process.stdout.write(JSON.stringify({ ...result, modes: MODES }, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`  ${parchment('Current mode:')} ${pc.bold(MODES[result.mode].label)}  ${dim(MODES[result.mode].tagline)}`)
  body.push(`  ${parchment('Provider:')}     ${result.provider} — ${describeProvider(result.provider)}`)
  body.push('')
  if (result.compliant) {
    body.push(`  ${pc.green('✓')} ${result.mode} mode — ${result.dataflow}`)
  } else {
    body.push(`  ${pc.red('✖')} ${result.violation ?? 'provider outside the declared mode'}`)
  }
  body.push('')
  body.push(...renderModeLadder(result.mode))

  const verdict = result.compliant ? 'approved' : 'changes-requested'
  printCarbonReport({
    title: 'vectalon mode — where your source runs',
    verdict,
    lines: body,
    reportPath: join(root, 'docs', 'vectalon', 'mode', 'report.txt'),
    root,
    done: result.compliant
      ? `Mode verified — ${result.mode} (${result.provider}): ${result.dataflow}.`
      : 'Fix the provider/mode mismatch with vc mode --set <mode> or vc init --model <provider>.',
  })
}
