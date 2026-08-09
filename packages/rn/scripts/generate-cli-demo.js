#!/usr/bin/env node
/**
 * Generate the committed CLI demo (apps/website/demo/cli-app) paper trail.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Requires the built dist (`pnpm --filter @vectalon-dev/rn build`), then:
 *   1. scaffolds a plain TypeScript CLI app (no Expo, no react-native) — the
 *      non-Expo project shape the daily-loop demo needs;
 *   2. replays the full 13-phase feature-development workflow with a SCRIPTED
 *      model router + dry-run adapters (no model download, no network, no
 *      simulator) — deterministic and repeatable;
 *   3. publishes the completion proof into the tracked docs/vectalon/ tree
 *      (phase documents + workflow-state.json + manifest.json) so the paper
 *      trail survives clones even though .vectalon/ is gitignored.
 *
 * The same replay is the CI golden test (__tests__/workflows/goldenFeatureWorkflow.test.ts),
 * so the demo and the test can never drift apart.
 */
const { mkdirSync, existsSync } = require('fs')
const path = require('path')

const rnRoot = path.resolve(__dirname, '..')
const distEntry = path.join(rnRoot, 'dist', 'testing', 'goldenWorkflow.js')
if (!existsSync(distEntry)) {
  console.error(
    'dist/ is missing — build the package first: pnpm --filter @vectalon-dev/rn build'
  )
  process.exit(1)
}

const {
  writeCliScaffold,
  runGoldenFeatureWorkflow,
  GOLDEN_FEATURE_PROMPT,
  publishPaperTrail,
} = require('../dist/testing/goldenWorkflow')
const repoRoot = path.resolve(rnRoot, '..', '..')
const demoDir = path.join(repoRoot, 'apps', 'website', 'demo', 'cli-app')

async function main() {
  console.log(`Scaffolding + replaying golden workflow at ${demoDir}`)
  mkdirSync(demoDir, { recursive: true })
  writeCliScaffold(demoDir)

  const kinds = []
  const state = await runGoldenFeatureWorkflow(demoDir, {
    prompt: GOLDEN_FEATURE_PROMPT,
    onGenerate: info => {
      kinds.push(info.kind)
      console.log(`  model generate [${info.kind}]`)
    },
  })

  if (state.status !== 'completed') {
    const failed = state.phases.find(p => p.status === 'failed')
    console.error(`Workflow did not complete (${state.status})`)
    console.error(`Failed phase: ${failed && failed.id} — ${failed && failed.error}`)
    process.exit(1)
  }

  const manifest = {
    version: require(path.join(rnRoot, 'package.json')).version,
    projectName: 'cli-app',
    tooling: 'rn-cli',
    initializedAt: Date.now(),
    modelProvider: 'local',
    autoLearn: true,
    modelConfig: { modelName: 'qwen2.5-coder-3b' },
  }
  const written = publishPaperTrail(demoDir, state, manifest)

  console.log(`\nWorkflow completed: ${state.phases.length}/${state.phases.length} phases green (${state.id})`)
  console.log(`Generate calls: ${kinds.join(', ')}`)
  console.log('Paper trail published:')
  for (const file of written) console.log(`  ${path.relative(process.cwd(), file)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
