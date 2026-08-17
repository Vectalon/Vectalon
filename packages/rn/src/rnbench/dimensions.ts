/**
 * vectalon rnbench — the Vectalon RN Engineering Benchmark dimensions.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Eight engineering dimensions a React Native team actually cares about.
 * Every scenario in the 35-scenario pack maps to exactly ONE dimension (the
 * mapping below is published, so it is auditable — no cherry-picking which
 * scenario counts for which dimension).
 */
export const DIMENSIONS = [
  { id: 'architecture', label: 'Architecture', what: 'layering, navigation, typed structure, refactors' },
  { id: 'native-integration', label: 'Native integration', what: 'native APIs, biometrics, media, device surfaces' },
  { id: 'dependency-management', label: 'Dependency management', what: 'adding and removing dependencies with full native cleanup' },
  { id: 'testing', label: 'Testing', what: 'multi-step flows, forms, validation, edge cases' },
  { id: 'performance', label: 'Performance', what: 'lists, feeds, rendering, timers, search' },
  { id: 'security', label: 'Security', what: 'auth, secure persistence, privacy controls' },
  { id: 'upgrades', label: 'Upgrades', what: 'RN/Expo upgrade breakages — dependency, native, toolchain' },
  { id: 'debugging', label: 'Debugging', what: 'diagnosing and fixing real build/runtime failures' },
] as const

export type RnnDimensionId = (typeof DIMENSIONS)[number]['id']

/** Scenario short id (rn-01) → dimension. Published and auditable. */
export const SCENARIO_DIMENSION: Record<string, RnnDimensionId> = {
  'rn-01': 'security',
  'rn-02': 'performance',
  'rn-03': 'architecture',
  'rn-04': 'architecture',
  'rn-05': 'security',
  'rn-06': 'testing',
  'rn-07': 'performance',
  'rn-08': 'architecture',
  'rn-09': 'testing',
  'rn-10': 'architecture',
  'rn-11': 'dependency-management',
  'rn-12': 'performance',
  'rn-13': 'security',
  'rn-14': 'testing',
  'rn-15': 'performance',
  'rn-16': 'performance',
  'rn-17': 'performance',
  'rn-18': 'testing',
  'rn-19': 'testing',
  'rn-20': 'testing',
  'rn-21': 'native-integration',
  'rn-22': 'performance',
  'rn-23': 'native-integration',
  'rn-24': 'architecture',
  'rn-25': 'testing',
  'rn-26': 'testing',
  'rn-27': 'native-integration',
  'rn-28': 'performance',
  'rn-29': 'architecture',
  'rn-30': 'testing',
  'rn-31': 'performance',
  'rn-32': 'performance',
  'rn-33': 'security',
  'rn-34': 'dependency-management',
  'rn-35': 'dependency-management',
}

/** Short id from a full scenario id (rn-01-login-screen → rn-01). */
export function shortId(id: string): string {
  return id.split('-').slice(0, 2).join('-')
}

/** The dimension a scenario belongs to (null when unmapped — a data error). */
export function dimensionOf(scenarioId: string): RnnDimensionId | null {
  return SCENARIO_DIMENSION[shortId(scenarioId)] ?? null
}
