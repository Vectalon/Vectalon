/**
 * Metro Diagnostics (Roadmap 011) — config validation, alias resolution, and
 * cache troubleshooting advice. Deterministic; suggests fixes automatically.
 * Business Source License 1.1 (BSL-1.1)
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { detectWorkspace } from '../harness'
import { reportError } from '../utils/safe'
import type { DiagnosticCheck } from './types'

/** Validate metro.config.js / metro.config.cjs: parse errors, alias targets, watchFolders. */
export function metroChecks(root: string): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const candidates = ['metro.config.js', 'metro.config.cjs', 'metro.config.mjs', 'metro.config.ts']
  const configPath = candidates.find(c => existsSync(join(root, c)))
  if (!configPath) {
    checks.push({
      id: 'metro-config',
      title: 'Metro config',
      category: 'metro',
      status: 'info',
      detail: 'No metro.config.js — Metro runs with defaults (fine for simple projects).',
      fix: 'For monorepos or custom resolvers add metro.config.js with `const { getDefaultConfig } = require(\'@react-native/metro-config\')`.',
    })
    return checks
  }

  let content = ''
  try {
    content = readFileSync(join(root, configPath), 'utf-8')
  } catch (err) {
    reportError(err, 'diagnostics: reading metro config')
  }

  // Configuration object shape: module.exports = { ... } (or config = {...}).
  const hasConfigObject = /module\.exports\s*=|export\s+default|const\s+config\s*=/.test(content)
  if (!hasConfigObject) {
    checks.push({ id: 'metro-config-shape', title: 'Metro config shape', category: 'metro', status: 'warn', detail: `${configPath} does not obviously export a config object — Metro may be silently ignoring it.`, fix: 'Export the config: `module.exports = { transformer, resolver, ... }` (or `export default`).' })
  }

  // Alias resolution: resolver.alias keys must point at existing files/dirs.
  const aliasMatch = content.match(/alias\s*:\s*\{([^}]*)\}/)
  if (aliasMatch) {
    const entries = [...aliasMatch[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)]
    for (const entry of entries) {
      const [, from, to] = entry
      const target = to.startsWith('.') ? join(root, to) : to
      const exists = target.startsWith('/') || to.includes('node_modules') ? existsSync(target) || existsSync(join(root, 'node_modules', to)) : existsSync(target)
      checks.push({
        id: `metro-alias-${from.replace(/[^a-z0-9-]/gi, '-')}`,
        title: `Alias ${from}`,
        category: 'metro',
        status: exists ? 'pass' : 'fail',
        detail: `resolver.alias maps ${from} → ${to}${exists ? ' — resolves.' : ' — target does not exist.'}`,
        fix: exists ? undefined : `Point the ${from} alias at a real path, or remove it from metro.config.js.`,
      })
    }
  } else {
    checks.push({ id: 'metro-alias', title: 'Resolver aliases', category: 'metro', status: 'pass', detail: 'No resolver.alias block — imports resolve through Metro defaults.' })
  }

  // watchFolders for monorepos.
  const ws = detectWorkspace(root)
  if (ws.isMonorepo) {
    const hasWatch = /watchFolders\s*:/.test(content)
    checks.push({
      id: 'metro-watch-folders',
      title: 'watchFolders (monorepo)',
      category: 'metro',
      status: hasWatch ? 'pass' : 'warn',
      detail: hasWatch ? 'watchFolders configured.' : `Monorepo detected (${ws.manager}) but metro.config.js has no watchFolders — files outside this package may not hot-reload.`,
      fix: hasWatch ? undefined : `Add watchFolders to metro.config.js (see @react-native/metro-config monorepo docs) or use the Expo monorepo preset.`,
    })
  }

  // Cache advisory: cacheVersion + transformer.
  if (/cacheVersion\s*:/.test(content)) {
    checks.push({ id: 'metro-cache-version', title: 'Metro cache version', category: 'metro', status: 'pass', detail: 'cacheVersion is set — stale-cache busting is explicit.' })
  } else {
    checks.push({
      id: 'metro-cache', title: 'Metro cache troubleshooting', category: 'metro', status: 'info',
      detail: 'Metro caches aggressively; after dependency or config changes, stale bundles hide fixes.',
      fix: 'Clear the cache: `npx react-native start --reset-cache` (or delete node_modules/.cache/metro).',
    })
  }
  return checks
}
