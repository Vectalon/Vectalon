import { getPreset, getDefaultPreset, listPresets } from '../../model/local/presets'
import { downloadModel } from '../../model/local/download'
import { logger } from '../logger'

export async function pullCommand(presetId: string | undefined): Promise<void> {
  const preset = presetId ? getPreset(presetId) : getDefaultPreset()

  if (!preset) {
    logger.error(`Unknown model preset: ${presetId}`)
    logger.info('Available presets:')
    for (const p of listPresets()) {
      logger.dim(`  - ${p.id}: ${p.name} (${p.license}, ~${p.sizeGb} GB)`)
    }
    process.exit(1)
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
