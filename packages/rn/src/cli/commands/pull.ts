import {
  getPreset,
  getDefaultPreset,
  listPresets,
  resolvePresetValue,
  listUsagePresets,
  getUsagePreset,
  autoSelectUsagePreset,
} from '../../model/local/presets'
import { totalmem } from 'os'
import { downloadModel } from '../../model/local/download'
import { logger } from '../logger'

/**
 * Resolve a `vectalon pull` argument: a usage tier (fast|balanced|quality),
 * a model preset id, or nothing → the tier auto-selected for this machine's
 * RAM (so `vectalon pull` always fetches the model init actually chose).
 */
export function resolvePullPreset(presetId: string | undefined) {
  if (presetId) {
    const model = resolvePresetValue(presetId)
    if (model) return { preset: model, tier: getUsagePreset(presetId)?.id }
    return undefined
  }
  const tier = autoSelectUsagePreset(totalmem() / 1024 / 1024 / 1024)
  return { preset: getPreset(tier.modelId) || getDefaultPreset(), tier: tier.id }
}

export async function pullCommand(presetId: string | undefined): Promise<void> {
  const resolved = resolvePullPreset(presetId)
  const preset = resolved ? resolved.preset : undefined

  if (!resolved || !preset) {
    logger.error(`Unknown model preset: ${presetId}`)
    logger.info('Usage tiers (auto-selected by RAM):')
    for (const t of listUsagePresets()) {
      logger.dim(`  - ${t.id} → ${t.modelId} (${t.ramLabel}, ${t.description})`)
    }
    logger.info('Model presets:')
    for (const p of listPresets()) {
      logger.dim(`  - ${p.id}: ${p.name} (${p.license}, ~${p.sizeGb} GB)`)
    }
    process.exit(1)
  }

  if (resolved.tier) {
    const how = presetId
      ? `explicit tier ${resolved.tier}`
      : `tier ${resolved.tier} (auto-selected for ${(totalmem() / 1024 / 1024 / 1024).toFixed(0)} GB RAM)`
    logger.info(`Preset ${how}`)
  }

  logger.info(`Downloading ${preset.name} (${preset.license}, ~${preset.sizeGb} GB)`)
  logger.dim(`  Source: ${preset.uri}`)

  try {
    const result = await downloadModel(preset, ({ totalSize, downloadedSize }) => {
      const pct = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
      const mb = Math.round(downloadedSize / 1024 / 1024)
      const totalMb = Math.round(totalSize / 1024 / 1024)
      logger.raw(`\r  Progress: ${pct}% (${mb} / ${totalMb} MB)`)
    })

    logger.raw('\n')
    if (result.alreadyExists) {
      logger.success(`Model already exists: ${result.filePath}`)
    } else {
      logger.success(`Downloaded to: ${result.filePath}`)
    }
  } catch (err) {
    logger.raw('\n')
    logger.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
