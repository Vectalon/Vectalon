/**
 * FlavorDetector — zero-config flavor detection (Phase 1).
 *
 * Scans the project for named build variants:
 * - Android: `android/app/build.gradle` `productFlavors { … }` block names.
 * - iOS: `ios/*.xcscheme` scheme names (each scheme becomes a flavor).
 * - Expo: `eas.json` build profile names.
 *
 * Detected flavors are merged with the user-managed override file
 * `.vectalon/builds/flavors.json` (schema-sha256 https://vectalon.in/schemas/
 * flavors.json is implied; the file wins for names it defines, and the
 * `isDefault` flag is honored). Results are cached to that file on first
 * detection so users can edit them.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { FlavorConfig, FlavorDetectResult } from './types'

export const FLAVORS_CONFIG_PATH = join('.vectalon', 'builds', 'flavors.json')

/** Parse `productFlavors { … }` direct child names from a Gradle file. Tracks
 * brace depth relative to the block so multi-line flavor blocks and nested
 * keys inside flavors are handled correctly. */
export function parseGradleProductFlavors(gradleContent: string): string[] {
  const flavors: string[] = []
  let depth = 0
  for (const raw of gradleContent.split('\n')) {
    const line = raw.trim()
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    if (depth === 0) {
      if (/productFlavors\s*\{/.test(line)) depth = opens - closes
      continue
    }
    // Direct child of the block: depth is exactly 1 and the line opens a brace.
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/)
    if (match && depth === 1) flavors.push(match[1])
    depth += opens - closes
    if (depth <= 0) depth = 0
  }
  return flavors
}

/** Extract target names (BlueprintName) referenced by an .xcscheme file. The
 * scheme's own name comes from the FILE name (one scheme per file in Xcode);
 * this content parse is the fallback signal used when a file has no name. */
export function parseXcodeSchemes(xcschemeContent: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const re = /BlueprintName="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xcschemeContent)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1])
      names.push(match[1])
    }
  }
  return names
}

/** Parse Expo eas.json build profile names. */
export function parseEasProfiles(easJsonContent: string): string[] {
  try {
    const eas = JSON.parse(easJsonContent) as { build?: Record<string, unknown> }
    if (!eas.build || typeof eas.build !== 'object') return []
    return Object.keys(eas.build).filter(k => k !== 'extends')
  } catch {
    return []
  }
}

export function detectFlavorsFromFiles(root: string): FlavorConfig[] {
  const flavors: FlavorConfig[] = []
  const seen = new Set<string>()

  // Android — productFlavors block.
  for (const candidate of ['android/app/build.gradle', 'android/app/build.gradle.kts']) {
    const p = join(root, candidate)
    if (existsSync(p)) {
      const names = parseGradleProductFlavors(readFileSync(p, 'utf-8'))
      for (const name of names) {
        if (!seen.has(name)) {
          seen.add(name)
          flavors.push({ name, android: name })
        }
      }
      break
    }
  }

  // iOS — shared schemes.
  const schemesDir = join(root, 'ios')
  if (existsSync(schemesDir)) {
    const schemeFiles: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'build' || entry.name.startsWith('.')) continue
          walk(full)
        } else if (entry.name.endsWith('.xcscheme')) {
          schemeFiles.push(full)
        }
      }
    }
    walk(schemesDir)
    for (const file of schemeFiles) {
      // The scheme name is the file name (Xcode: one scheme per .xcscheme).
      const name = file.split('/').pop()?.replace(/\.xcscheme$/, '') || ''
      if (name && !seen.has(name)) {
        seen.add(name)
        flavors.push({ name, ios: name })
        continue
      }
      // Fallback: target names referenced inside the file.
      const names = parseXcodeSchemes(readFileSync(file, 'utf-8'))
      for (const inner of names) {
        if (!seen.has(inner)) {
          seen.add(inner)
          flavors.push({ name: inner, ios: inner })
        }
      }
    }
  }

  // Expo — eas.json build profiles (flavors with no platform mapping).
  const easPath = join(root, 'eas.json')
  if (existsSync(easPath)) {
    const names = parseEasProfiles(readFileSync(easPath, 'utf-8'))
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name)
        flavors.push({ name })
      }
    }
  }

  return flavors
}

/** Read the user override file .vectalon/builds/flavors.json (empty when absent/invalid). */
export function readUserFlavors(root: string): FlavorConfig[] {
  const p = join(root, FLAVORS_CONFIG_PATH)
  if (!existsSync(p)) return []
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as { flavors?: unknown }
    if (!Array.isArray(parsed.flavors)) return []
    return parsed.flavors.filter(
      (f): f is FlavorConfig => !!f && typeof f === 'object' && typeof (f as FlavorConfig).name === 'string'
    )
  } catch {
    return []
  }
}

export function writeUserFlavors(root: string, flavors: FlavorConfig[]): void {
  const p = join(root, FLAVORS_CONFIG_PATH)
  mkdirSync(join(root, '.vectalon', 'builds'), { recursive: true })
  writeFileSync(p, JSON.stringify({ $schema: 'https://vectalon.in/schemas/flavors.json', flavors }, null, 2) + '\n')
}

/**
 * Detect flavors for a project: auto-detected platform flavors merged with
 * the user-managed flavors.json. User config wins for names it defines;
 * auto-detected flavors not present in the user file are kept (mixed).
 */
export function detectFlavors(root: string): FlavorDetectResult {
  const auto = detectFlavorsFromFiles(root)
  const user = readUserFlavors(root)

  if (user.length === 0) {
    return {
      flavors: auto,
      source: 'auto-detected',
      ...(auto.length === 0 ? { note: 'No productFlavors, Xcode schemes, or eas.json build profiles found.' } : {}),
    }
  }

  const merged = [...user]
  const userNames = new Set(user.map(f => f.name))
  for (const f of auto) {
    if (!userNames.has(f.name)) merged.push(f)
  }
  return { flavors: merged, source: 'mixed' }
}

/** Pick the flavor to use: explicit name, the isDefault one, or the first. */
export function resolveFlavor(flavors: FlavorConfig[], requested?: string): FlavorConfig | null {
  if (flavors.length === 0) return null
  if (requested) {
    return flavors.find(f => f.name === requested) ?? null
  }
  return flavors.find(f => f.isDefault) ?? flavors[0]
}
