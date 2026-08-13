import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'fs'
import { join, resolve, relative, basename, isAbsolute } from 'path'
import { reportError } from './safe'
import type { DevicePlatform } from '../adapters/deviceControl'
import type { VisualDiffOptions } from './visualDiff'

/**
 * Reference image store — the "expected design" side of the visual
 * verification loop. References live in a store directory (the runtime store
 * under `.vectalon/artifacts/reference/` by default, or a committed baseline
 * store under `docs/vectalon/visual-baselines/`), tracked in a small
 * `references.json` manifest so the workflow can diff a fresh screenshot
 * against the right baseline and report UI regressions.
 *
 * The same class serves both stores: the runtime store is per-machine state
 * (dev screenshots, Figma exports, MCP tool writes), and the committed store
 * is the CI baseline source that travels with the repo. They share the
 * manifest format, atomic writes, and key validation.
 *
 * Paths are persisted relative to the project root so the store survives
 * directory moves and can be committed to the repo.
 */

/** Declared flake state for a baseline — committed, never gates the run. */
export interface ReferenceQuarantine {
  reason: string
  since: number
}

export interface ReferenceMeta {
  platform: DevicePlatform
  /** Where the reference came from: 'device capture', 'explicit path', 'verification baseline'. */
  source: string
  capturedAt: number
  /** Declared flake state (committed store). Pass null to clear on save/update. */
  quarantine?: ReferenceQuarantine | null
  /** Per-key diff tolerance overrides, merged over CLI defaults at run time. */
  tolerance?: Partial<VisualDiffOptions>
}

export interface ReferenceEntry extends ReferenceMeta {
  /** Sanitized store key (safe filename). */
  key: string
  /** Absolute path to the stored PNG. */
  path: string
}

interface ManifestScreen {
  path: string
  platform: DevicePlatform
  source: string
  capturedAt: number
  quarantine?: ReferenceQuarantine
  tolerance?: Partial<VisualDiffOptions>
}

interface Manifest {
  screens: Record<string, ManifestScreen>
}

export interface ReferenceStoreOptions {
  /**
   * Store directory relative to (or absolute from) the project root. Defaults
   * to the runtime store (`.vectalon/artifacts/reference`). Pass
   * `visualBaselineDir(root)` for the committed CI baseline store.
   */
  dir?: string
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Runtime reference store (gitignored per-machine state). */
export function referenceDir(root: string): string {
  return join(root, '.vectalon', 'artifacts', 'reference')
}

/** Committed baseline store — reviewable in the PR diff, present in CI. */
export function visualBaselineDir(root: string): string {
  return join(root, 'docs', 'vectalon', 'visual-baselines')
}

export function isValidReferenceKey(key: string): boolean {
  return KEY_PATTERN.test(key) && !key.includes('..')
}

export class ReferenceStore {
  private readonly root: string
  private readonly dir: string

  constructor(root: string, options: ReferenceStoreOptions = {}) {
    this.root = root
    this.dir = options.dir ? resolve(root, options.dir) : referenceDir(root)
  }

  private manifestPath(): string {
    return join(this.dir, 'references.json')
  }

  private loadManifest(): Manifest {
    const path = this.manifestPath()
    try {
      if (existsSync(path)) {
        const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<Manifest>
        return { screens: raw.screens || {} }
      }
    } catch (err) {
      reportError(err, 'referenceStore: reading manifest')
    }
    return { screens: {} }
  }

  private writeManifest(manifest: Manifest): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      // Atomic write (temp file + rename) so a daemon and `serve` sharing the
      // project never observe a half-written manifest.
      const tmp = join(this.dir, `references.json.${process.pid}.tmp`)
      writeFileSync(tmp, JSON.stringify(manifest, null, 2))
      renameSync(tmp, this.manifestPath())
    } catch (err) {
      reportError(err, 'referenceStore: writing manifest')
    }
  }

  /** Absolute path where a reference image for `key` would be stored. */
  private storedPath(key: string, platform: DevicePlatform): string {
    return join(this.dir, `${key}-${platform}.png`)
  }

  private toEntry(key: string, entry: ManifestScreen): ReferenceEntry | null {
    const abs = isAbsolute(entry.path) ? entry.path : resolve(this.root, entry.path)
    if (!existsSync(abs)) return null
    return {
      key,
      path: abs,
      platform: entry.platform,
      source: entry.source,
      capturedAt: entry.capturedAt,
      quarantine: entry.quarantine,
      tolerance: entry.tolerance,
    }
  }

  /**
   * Store an image file as the reference for `key`. The source file is copied
   * into the store (the original may be a throwaway screenshot or a Figma
   * export). Returns the new entry, or null when the source is missing.
   */
  save(key: string, sourcePath: string, meta: ReferenceMeta): ReferenceEntry | null {
    if (!isValidReferenceKey(key)) return null
    if (!existsSync(sourcePath)) return null
    const dest = this.storedPath(key, meta.platform)
    try {
      mkdirSync(this.dir, { recursive: true })
      copyFileSync(sourcePath, dest)
      const manifest = this.loadManifest()
      const capturedAt = meta.capturedAt ?? Date.now()
      const screen: ManifestScreen = {
        path: relative(this.root, dest),
        platform: meta.platform,
        source: meta.source,
        capturedAt,
      }
      if (meta.quarantine) screen.quarantine = meta.quarantine
      if (meta.tolerance) screen.tolerance = meta.tolerance
      manifest.screens[key] = screen
      this.writeManifest(manifest)
      return this.toEntry(key, screen)
    } catch (err) {
      reportError(err, 'referenceStore: saving reference')
      return null
    }
  }

  /** Look up a stored reference by key. */
  get(key: string): ReferenceEntry | null {
    if (!isValidReferenceKey(key)) return null
    const entry = this.loadManifest().screens[key]
    if (!entry) return null
    return this.toEntry(key, entry)
  }

  /** All stored references, newest first. */
  list(): ReferenceEntry[] {
    const manifest = this.loadManifest()
    return Object.entries(manifest.screens)
      .map(([key, entry]) => this.toEntry(key, entry))
      .filter((e): e is ReferenceEntry => e !== null)
      .sort((a, b) => b.capturedAt - a.capturedAt)
  }

  /** The most recently captured reference for a platform (any platform when omitted). */
  latest(platform?: DevicePlatform): ReferenceEntry | null {
    const entries = this.list().filter(e => !platform || e.platform === platform)
    return entries[0] || null
  }

  /**
   * Mark (or clear) the declared quarantine for a stored reference. Manifest-only
   * — the image stays. Returns false when the key does not exist.
   */
  setQuarantine(key: string, quarantine: ReferenceQuarantine | null): boolean {
    if (!isValidReferenceKey(key)) return false
    const manifest = this.loadManifest()
    const entry = manifest.screens[key]
    if (!entry) return false
    if (quarantine) entry.quarantine = quarantine
    else delete entry.quarantine
    this.writeManifest(manifest)
    return true
  }

  /** Remove a stored reference. Returns true when one was removed. */
  remove(key: string): boolean {
    if (!isValidReferenceKey(key)) return false
    const manifest = this.loadManifest()
    const entry = manifest.screens[key]
    if (!entry) return false
    delete manifest.screens[key]
    this.writeManifest(manifest)
    try {
      const abs = isAbsolute(entry.path) ? entry.path : resolve(this.root, entry.path)
      if (existsSync(abs) && basename(abs).includes(key)) rmSync(abs, { force: true })
    } catch (err) {
      reportError(err, 'referenceStore: removing image')
    }
    return true
  }
}
