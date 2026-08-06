import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'fs'
import { join, resolve, relative, basename, isAbsolute } from 'path'
import { reportError } from './safe'
import type { DevicePlatform } from '../adapters/deviceControl'

/**
 * Reference image store — the "expected design" side of the visual
 * verification loop. References live under `.vectalon/artifacts/reference/`
 * (screenshots of known-good states, or exported Figma frames), tracked in a
 * small `references.json` manifest so the workflow can diff a fresh screenshot
 * against the right baseline and report UI regressions.
 *
 * Paths are persisted relative to the project root so the store survives
 * directory moves and can be committed to the repo.
 */

export interface ReferenceMeta {
  platform: DevicePlatform
  /** Where the reference came from: 'device capture', 'explicit path', 'verification baseline'. */
  source: string
  capturedAt: number
}

export interface ReferenceEntry extends ReferenceMeta {
  /** Sanitized store key (safe filename). */
  key: string
  /** Absolute path to the stored PNG. */
  path: string
}

interface Manifest {
  screens: Record<
    string,
    {
      path: string
      platform: DevicePlatform
      source: string
      capturedAt: number
    }
  >
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function referenceDir(root: string): string {
  return join(root, '.vectalon', 'artifacts', 'reference')
}

export function isValidReferenceKey(key: string): boolean {
  return KEY_PATTERN.test(key) && !key.includes('..')
}

export class ReferenceStore {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  private manifestPath(): string {
    return join(referenceDir(this.root), 'references.json')
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
      const dir = referenceDir(this.root)
      mkdirSync(dir, { recursive: true })
      // Atomic write (temp file + rename) so a daemon and `serve` sharing the
      // project never observe a half-written manifest.
      const tmp = join(dir, `references.json.${process.pid}.tmp`)
      writeFileSync(tmp, JSON.stringify(manifest, null, 2))
      renameSync(tmp, this.manifestPath())
    } catch (err) {
      reportError(err, 'referenceStore: writing manifest')
    }
  }

  /** Absolute path where a reference image for `key` would be stored. */
  private storedPath(key: string, platform: DevicePlatform): string {
    return join(referenceDir(this.root), `${key}-${platform}.png`)
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
      mkdirSync(referenceDir(this.root), { recursive: true })
      copyFileSync(sourcePath, dest)
      const manifest = this.loadManifest()
      const capturedAt = meta.capturedAt ?? Date.now()
      manifest.screens[key] = {
        path: relative(this.root, dest),
        platform: meta.platform,
        source: meta.source,
        capturedAt,
      }
      this.writeManifest(manifest)
      return {
        key,
        path: dest,
        platform: meta.platform,
        source: meta.source,
        capturedAt,
      }
    } catch (err) {
      reportError(err, 'referenceStore: saving reference')
      return null
    }
  }

  /** Look up a stored reference by key. */
  get(key: string): ReferenceEntry | null {
    if (!isValidReferenceKey(key)) return null
    const manifest = this.loadManifest()
    const entry = manifest.screens[key]
    if (!entry) return null
    const abs = isAbsolute(entry.path) ? entry.path : resolve(this.root, entry.path)
    if (!existsSync(abs)) return null
    return { key, path: abs, platform: entry.platform, source: entry.source, capturedAt: entry.capturedAt }
  }

  /** All stored references, newest first. */
  list(): ReferenceEntry[] {
    const manifest = this.loadManifest()
    return Object.entries(manifest.screens)
      .map(([key, entry]) => {
        const abs = isAbsolute(entry.path) ? entry.path : resolve(this.root, entry.path)
        if (!existsSync(abs)) return null
        return { key, path: abs, platform: entry.platform, source: entry.source, capturedAt: entry.capturedAt }
      })
      .filter((e): e is ReferenceEntry => e !== null)
      .sort((a, b) => b.capturedAt - a.capturedAt)
  }

  /** The most recently captured reference for a platform (any platform when omitted). */
  latest(platform?: DevicePlatform): ReferenceEntry | null {
    const entries = this.list().filter(e => !platform || e.platform === platform)
    return entries[0] || null
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
