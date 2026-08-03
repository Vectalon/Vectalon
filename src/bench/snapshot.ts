/**
 * Phase V-5 benchmark — shared benchmark project snapshot.
 *
 * A minimal TypeScript-convention snapshot so the deterministic scaffold and the
 * model seam emit .ts/.tsx. Lives in its own module because both runner.ts and
 * modelGenerate.ts import it — sharing it avoids a circular import.
 */

import type { ContextSnapshot } from '../harness/types'

export function benchmarkSnapshot(): ContextSnapshot {
  return {
    project: {
      root: '',
      name: 'rn-bench-app',
      version: '1.0.0',
      reactNativeVersion: '0.74.0',
      dependencies: {},
      devDependencies: {},
      scripts: {},
      platforms: ['ios', 'android'],
      hasTypeScript: true,
      hasMetro: true,
      hasExpo: false,
      tooling: 'rn-cli',
      expoSdkVersion: '',
    },
    structure: [],
    components: [],
    recentChanges: [],
    timestamp: Date.now(),
  }
}
