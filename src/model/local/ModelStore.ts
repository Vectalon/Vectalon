import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface DownloadedModel {
  id: string
  name: string
  uri: string
  license: string
  licenseUrl?: string
  filePath: string
  downloadedAt: number
  sizeBytes: number
}

function modelsDir(): string {
  const base = process.env.RN_VECTALON_CONFIG_DIR || join(homedir(), '.config', 'rn-vectalon')
  return join(base, 'models')
}

function manifestPath(): string {
  return join(modelsDir(), 'manifest.json')
}

function ensureDir(): void {
  mkdirSync(modelsDir(), { recursive: true })
}

function readManifest(): Record<string, DownloadedModel> {
  ensureDir()
  if (!existsSync(manifestPath())) return {}
  try {
    return JSON.parse(readFileSync(manifestPath(), 'utf-8')) as Record<string, DownloadedModel>
  } catch {
    return {}
  }
}

function writeManifest(models: Record<string, DownloadedModel>): void {
  ensureDir()
  writeFileSync(manifestPath(), JSON.stringify(models, null, 2))
}

export function getModelDir(): string {
  ensureDir()
  return modelsDir()
}

export function listDownloadedModels(): DownloadedModel[] {
  return Object.values(readManifest())
}

export function getDownloadedModel(id: string): DownloadedModel | undefined {
  return readManifest()[id]
}

export function hasDownloadedModel(id: string): boolean {
  const model = getDownloadedModel(id)
  return !!model && existsSync(model.filePath)
}

export function registerModel(model: DownloadedModel): void {
  const models = readManifest()
  models[model.id] = model
  writeManifest(models)
}

export function unregisterModel(id: string): void {
  const models = readManifest()
  delete models[id]
  writeManifest(models)
}

export function getModelSizeBytes(filePath: string): number {
  if (!existsSync(filePath)) return 0
  return statSync(filePath).size
}

export function resolveModelFileName(uri: string): string {
  const withoutScheme = uri.replace(/^hf:/, '')
  const parts = withoutScheme.split(':')
  const repo = parts[0].replace(/\//g, '_')
  const quant = parts[1] || 'default'
  return `${repo}_${quant}.gguf`
}

export function findExistingModelFiles(): string[] {
  ensureDir()
  return readdirSync(modelsDir())
    .filter(f => f.endsWith('.gguf'))
    .map(f => join(modelsDir(), f))
}
