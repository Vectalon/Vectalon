import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectModelConfig } from './model/setup'
import { reportError } from './utils/safe'

export interface ProjectManifest {
  version: string
  projectName: string
  rnVersion: string
  tooling?: 'expo' | 'rn-cli'
  expoSdkVersion?: string
  initializedAt: number
  modelProvider?: string
  modelConfig?: ProjectModelConfig
  autoLearn?: boolean
}

export function manifestPath(root: string): string {
  return join(root, '.vectalon', 'rn-vectalon.json')
}

/** Read the project manifest written by `vectalon init`; null when absent/corrupt. */
export function readProjectManifest(root: string): ProjectManifest | null {
  try {
    const path = manifestPath(root)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as ProjectManifest
  } catch (err) {
    reportError(err, `projectManifest: reading ${manifestPath(root)}`)
    return null
  }
}

/**
 * Resolve the effective model provider for a run: an explicit CLI flag wins,
 * then the project manifest (set by `vectalon init`), then 'local'.
 */
export function resolveProjectModelProvider(root: string, cliProvider?: string): string {
  if (cliProvider) return cliProvider
  return readProjectManifest(root)?.modelProvider || 'local'
}

/** Resolve the project-level model config (modelName, apiKeyEnv) from the manifest. */
export function resolveProjectModelConfig(root: string): ProjectModelConfig | undefined {
  return readProjectManifest(root)?.modelConfig
}
