/**
 * Phase V-5 benchmark — shared benchmark project snapshot.
 *
 * A minimal TypeScript-convention snapshot so the deterministic scaffold and the
 * model seam emit .ts/.tsx. Lives in its own module because both runner.ts and
 * modelGenerate.ts import it — sharing it avoids a circular import.
 */

import type { ContextSnapshot } from '../harness/types'

export function benchmarkSnapshot(fixtures: Record<string, string> = {}): ContextSnapshot {
  let manifest: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(fixtures['package.json'] || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) manifest = parsed as Record<string, unknown>
  } catch { /* Malformed fixture metadata must not crash offline evaluation. */ }
  const strings = (value: unknown): Record<string, string> => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
  const dependencies = strings(manifest.dependencies)
  const devDependencies = strings(manifest.devDependencies)
  const hasExpo = Boolean(dependencies.expo || devDependencies.expo)
  return {
    project: {
      root: '',
      name: typeof manifest.name === 'string' ? manifest.name : 'rn-bench-app',
      version: typeof manifest.version === 'string' ? manifest.version : '1.0.0',
      reactNativeVersion: dependencies['react-native'] || devDependencies['react-native'] || '0.74.0',
      dependencies,
      devDependencies,
      scripts: strings(manifest.scripts),
      platforms: ['ios', 'android'],
      hasTypeScript: true,
      hasMetro: true,
      hasExpo,
      tooling: hasExpo ? 'expo' : 'rn-cli',
      expoSdkVersion: dependencies.expo || devDependencies.expo || '',
      reactVersion: dependencies.react || devDependencies.react || '18.2.0',
    },
    structure: [],
    components: [],
    recentChanges: [],
    timestamp: Date.now(),
  }
}
