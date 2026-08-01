import type { ModelPreset } from './presets'
import { dynamicImport } from '../../utils/dynamicImport'
import {
  getModelDir,
  registerModel,
  getDownloadedModel,
  hasDownloadedModel,
  getModelSizeBytes,
  resolveModelFileName,
} from './ModelStore'

export interface DownloadProgress {
  totalSize: number
  downloadedSize: number
}

export interface DownloadResult {
  id: string
  filePath: string
  alreadyExists: boolean
}

export async function downloadModel(
  preset: ModelPreset,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  if (hasDownloadedModel(preset.id)) {
    const existing = getDownloadedModel(preset.id)
    if (existing) {
      return { id: preset.id, filePath: existing.filePath, alreadyExists: true }
    }
  }

  const dirPath = getModelDir()
  const fileName = resolveModelFileName(preset.uri)

  try {
    const nlc = await dynamicImport<typeof import('node-llama-cpp')>('node-llama-cpp')
    const filePath = await nlc.resolveModelFile(preset.uri, {
      directory: dirPath,
      fileName,
      download: 'auto',
      verify: true,
      cli: true,
      onProgress,
    })

    registerModel({
      id: preset.id,
      name: preset.name,
      uri: preset.uri,
      license: preset.license,
      licenseUrl: preset.licenseUrl,
      filePath,
      downloadedAt: Date.now(),
      sizeBytes: getModelSizeBytes(filePath),
    })

    return { id: preset.id, filePath, alreadyExists: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to download model ${preset.id}: ${message}`)
  }
}
