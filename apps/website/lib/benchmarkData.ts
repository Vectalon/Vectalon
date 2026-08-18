import localResult from '../../../packages/rn/bench/results/local.json'

const pct = (value: number | null | undefined): number | null =>
  typeof value === 'number' ? Math.round(value * 100) : null

export const RUNS = localResult.runs.map(run => ({
  id: run.id.split('-').slice(0, 2).join('-'),
  title: run.title,
  suite: run.suite,
  composite: pct(run.composite),
  correctness: pct(run.axes.correctness),
  adherence: pct(run.axes.adherence),
  guardrails: pct(run.axes.guardrails),
  relative: pct(run.reference?.relative?.composite),
}))

const SUITE_WHY: Record<string, string> = {
  navigation: 'typed params + deep links',
  'core-ui': 'theming, tokens, feature flags',
  'forms-security': 'auth + forms — the highest-stakes screen',
  refactor: 'hooks migration + dependency removal',
  'data-flow': 'pagination + offline queues',
  a11y: 'screen-reader-friendly onboarding',
  perf: 'image-heavy feeds',
  upgrades: 'React Native version migration repairs',
  debugging: 'Metro, Hermes, TypeScript, and native linking repairs',
}

export const SUITES = localResult.suites.map(suite => ({
  name: suite.suite,
  composite: pct(suite.composite),
  guardrails: pct(suite.guardrails),
  why: SUITE_WHY[suite.suite],
}))

export const OVERALL = {
  composite: pct(localResult.overallComposite),
  guardrails: pct(localResult.overallGuardrails),
  referenceComposite: pct(localResult.overallReferenceComposite),
  relativeComposite: pct(localResult.overallRelativeComposite),
}
