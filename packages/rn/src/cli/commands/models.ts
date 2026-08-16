import Table from 'cli-table'
import { listPresets, listUsagePresets, autoSelectUsagePreset, getPreset } from '../../model/local/presets'
import { listDownloadedModels } from '../../model/local/ModelStore'
import { getWasmPreset, wasmCacheReady } from '../../model/local/wasmPresets'
import { totalmem } from 'os'
import { logger } from '../logger'

export async function modelsCommand(): Promise<void> {
  const totalRamGb = totalmem() / 1024 / 1024 / 1024
  const auto = autoSelectUsagePreset(totalRamGb)
  const downloaded = new Map(listDownloadedModels().map(m => [m.id, m]))

  // Usage tiers — the three knobs; init auto-selects one from this machine's RAM.
  const tierTable = new Table({
    head: ['Tier', 'Model', 'RAM', 'Status'],
    style: { head: ['cyan'] },
  })
  for (const tier of listUsagePresets()) {
    const model = downloaded.get(tier.modelId)
    const status = model ? `Downloaded (${formatBytes(model.sizeBytes)})` : 'Not downloaded'
    const marker = tier.id === auto.id ? '◄ auto-selected for this machine' : ''
    tierTable.push([tier.id, tier.modelId, tier.ramLabel, `${status}${marker ? ' ' + marker : ''}`])
  }
  logger.out(tierTable.toString() + '\n')

  const table = new Table({
    head: ['Model preset', 'License', 'Size', 'Status'],
    style: { head: ['cyan'] },
  })

  for (const preset of listPresets()) {
    const model = downloaded.get(preset.id)
    const status = model ? `Downloaded (${formatBytes(model.sizeBytes)})` : 'Not downloaded'
    table.push([preset.id, preset.license, `~${preset.sizeGb} GB`, status])
  }

  const wasm = getWasmPreset()
  table.push([
    `wasm (${wasm.modelId})`, wasm.license,
    `~${(wasm.sizeMb / 1024).toFixed(1)} GB`,
    wasmCacheReady() ? 'Cached (zero-config)' : 'Auto-downloads on first use',
  ])

  logger.out(table.toString() + '\n')

  logger.dim(`This machine: ${(totalRamGb).toFixed(0)} GB RAM → ${auto.id} tier (${auto.modelId}${getPreset(auto.modelId) ? `, ~${getPreset(auto.modelId)!.sizeGb} GB` : ''}). init selects this automatically; override with --preset.`)

  if (downloaded.size === 0) {
    logger.info('Run `vectalon pull` to download the auto-selected GGUF model (or use the zero-config WASM model as-is).')
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
