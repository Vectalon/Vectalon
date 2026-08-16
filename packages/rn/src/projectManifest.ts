import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ProjectModelConfig } from './model/setup'
import { reportError } from './utils/safe'
import { Scanner } from './harness'

/**
 * Project manifest schema version. v1 is the original `init`-written shape;
 * v2 adds `schemaVersion`, `platforms`, and `dependencies` (Roadmap 001).
 */
export const PROJECT_MANIFEST_SCHEMA_VERSION = 2

export interface ProjectManifest {
  /** Schema version — bump on incompatible shape changes; stored manifests stay readable. */
  schemaVersion?: number
  version: string
  projectName: string
  rnVersion: string
  tooling?: 'expo' | 'rn-cli'
  expoSdkVersion?: string
  /** Platforms the project targets (ios/android/web/…), from the RN version + tooling signals. */
  platforms?: string[]
  /** Runtime dependencies snapshot (package.json `dependencies`). */
  dependencies?: Record<string, string>
  initializedAt: number
  modelProvider?: string
  modelConfig?: ProjectModelConfig
  /** The usage tier (fast|balanced|quality) init auto-selected for this machine. */
  modelPreset?: string
  /** Deployment mode (cloud | private | air-gapped) — the privacy ladder. */
  deploymentMode?: string
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
 * Build the canonical v2 manifest from a live scan (Roadmap 001): read the
 * project's package.json + scanner signals and produce the versioned schema.
 * Deterministic — no model calls, no writes.
 */
export function buildProjectManifest(root: string): ProjectManifest {
  const scanner = new Scanner(root)
  const info = scanner.scanProject()
  const stored = readProjectManifest(root)
  return {
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    version: info.version || '0.0.0',
    projectName: info.name || basename(root),
    rnVersion: info.reactNativeVersion || stored?.rnVersion || '',
    tooling: info.tooling,
    expoSdkVersion: info.expoSdkVersion || stored?.expoSdkVersion || undefined,
    platforms: info.platforms.length > 0 ? info.platforms : undefined,
    dependencies: Object.keys(info.dependencies).length > 0 ? info.dependencies : undefined,
    initializedAt: stored?.initializedAt ?? Date.now(),
    modelProvider: stored?.modelProvider,
    deploymentMode: stored?.deploymentMode,
    modelConfig: stored?.modelConfig,
    autoLearn: stored?.autoLearn,
  }
}

/**
 * Validate a manifest against the schema (Roadmap 001: validation utilities).
 * Returns human-readable issues; empty array = valid.
 */
export function validateProjectManifest(manifest: ProjectManifest | null): string[] {
  if (!manifest) return ['manifest is missing']
  const issues: string[] = []
  if (manifest.schemaVersion === undefined) issues.push('schemaVersion is missing (stored manifest is v1 — re-run vectalon init)')
  if (!manifest.projectName) issues.push('projectName is empty')
  if (!manifest.rnVersion) issues.push('rnVersion is empty — could not detect a React Native dependency')
  if (manifest.tooling && !['expo', 'rn-cli'].includes(manifest.tooling)) issues.push(`tooling is invalid: ${manifest.tooling}`)
  if (manifest.tooling === 'expo' && !manifest.expoSdkVersion) issues.push('expo tooling detected but expoSdkVersion is missing')
  if (manifest.schemaVersion && manifest.schemaVersion > PROJECT_MANIFEST_SCHEMA_VERSION) {
    issues.push(`schemaVersion ${manifest.schemaVersion} is newer than supported ${PROJECT_MANIFEST_SCHEMA_VERSION}`)
  }
  return issues
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || 'project'
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
