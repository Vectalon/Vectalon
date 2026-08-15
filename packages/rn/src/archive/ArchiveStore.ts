/**
 * ArchiveStore — the build index (Phase 1).
 *
 * The design doc specifies a SQLite-backed store extending the ArtifactStore
 * facade. This package keeps the same zero-native-dependency stance: the
 * index is a deterministic JSON file at `.vectalon/builds.json` (the
 * "SQLite-backed via ArchiveStore" line is an implementation detail — the
 * interface below is what commands, MCP tools, and the portal consume, and
 * an SQLite engine can be swapped in behind the same surface later).
 *
 * Artifacts themselves live under `.vectalon/builds/<projectId>/<flavor>/
 * <environment>/<version>/<buildNumber>/{ios,android}/` per the design doc.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { BuildManifest, FlavorConfig } from './types'
import { assertValidBuildManifest } from './BuildManifest'

export interface ListBuildsOptions {
  flavor?: string
  platform?: string
  limit?: number
}

export interface ArchiveStoreOptions {
  /** Base directory (default: the project root passed to the store). */
  root: string
}

export const BUILDS_INDEX_REL = join('.vectalon', 'builds.json')

export function buildsIndexPath(root: string): string {
  return join(root, BUILDS_INDEX_REL)
}

export function buildsStoreDir(root: string): string {
  return join(root, '.vectalon', 'builds')
}

export function artifactStorePath(root: string, manifest: BuildManifest): string {
  return join(
    buildsStoreDir(root),
    manifest.projectId,
    manifest.flavor,
    manifest.environment,
    manifest.version,
    String(manifest.buildNumber),
    manifest.platform
  )
}

export class ArchiveStore {
  constructor(private readonly root: string) {}

  /** Load the index (empty array when the file is absent or corrupt). */
  load(): BuildManifest[] {
    const p = buildsIndexPath(this.root)
    if (!existsSync(p)) return []
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(m => {
        try {
          assertValidBuildManifest(m)
          return true
        } catch {
          return false
        }
      })
    } catch {
      return []
    }
  }

  private save(builds: BuildManifest[]): void {
    const p = buildsIndexPath(this.root)
    mkdirSync(join(this.root, '.vectalon'), { recursive: true })
    writeFileSync(p, JSON.stringify(builds, null, 2) + '\n')
  }

  /**
   * Add a build to the index. Dedupes by checksum (same artifact = same
   * build): returns the existing buildId instead of inserting a duplicate.
   */
  addBuild(manifest: BuildManifest): { buildId: string; duplicated: boolean; existingBuildId?: string } {
    assertValidBuildManifest(manifest)
    const builds = this.load()
    const dup = builds.find(b => b.checksum === manifest.checksum && b.platform === manifest.platform)
    if (dup) {
      return { buildId: dup.buildId, duplicated: true, existingBuildId: dup.buildId }
    }
    builds.push(manifest)
    this.save(builds)
    return { buildId: manifest.buildId, duplicated: false }
  }

  getBuild(buildId: string): BuildManifest | undefined {
    return this.load().find(b => b.buildId === buildId)
  }

  listBuilds(options: ListBuildsOptions = {}): BuildManifest[] {
    let builds = this.load()
    if (options.flavor) builds = builds.filter(b => b.flavor === options.flavor)
    if (options.platform) builds = builds.filter(b => b.platform === options.platform)
    builds.sort((a, b) => (a.buildTimestamp < b.buildTimestamp ? 1 : -1))
    if (options.limit && options.limit > 0) builds = builds.slice(0, options.limit)
    return builds
  }

  /** Resolve the latest build, optionally filtered by flavor/platform. */
  resolveLatest(options: ListBuildsOptions = {}): BuildManifest | undefined {
    return this.listBuilds(options)[0]
  }

  updateDistribution(buildId: string, distribution: BuildManifest['distribution']): BuildManifest | undefined {
    const builds = this.load()
    const idx = builds.findIndex(b => b.buildId === buildId)
    if (idx === -1) return undefined
    builds[idx] = { ...builds[idx], distribution }
    this.save(builds)
    return builds[idx]
  }

  /** Persist the detected flavor set to .vectalon/builds/flavors.json. */
  saveFlavors(flavors: FlavorConfig[]): void {
    const dir = join(this.root, '.vectalon', 'builds')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'flavors.json'),
      JSON.stringify({ $schema: 'https://vectalon.in/schemas/flavors.json', flavors }, null, 2) + '\n'
    )
  }
}
