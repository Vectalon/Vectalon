import Table from 'cli-table'
import { listPresets } from '../../model/local/presets'
import { listDownloadedModels } from '../../model/local/ModelStore'
import { logger } from '../logger'

export async function modelsCommand(): Promise<void> {
  const downloaded = new Map(listDownloadedModels().map(m => [m.id, m]))

  const table = new Table({
    head: ['Preset', 'License', 'Size', 'Status'],
    style: { head: ['cyan'] },
  })

  for (const preset of listPresets()) {
    const model = downloaded.get(preset.id)
    const status = model ? `Downloaded (${formatBytes(model.sizeBytes)})` : 'Not downloaded'
    table.push([preset.name, preset.license, `~${preset.sizeGb} GB`, status])
  }

  logger.out(table.toString() + '\n')

  if (downloaded.size === 0) {
    logger.info('Run `vectalon pull` to download the default model.')
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
