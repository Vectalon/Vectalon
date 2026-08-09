#!/usr/bin/env node
/**
 * Generate the committed Expo demo (apps/website/demo/login-app) paper trail.
 * Business Source License 1.1 (BSL-1.1)
 *
 * Requires the built dist (`pnpm --filter @vectalon-dev/rn build`), then:
 *   1. replays the full 13-phase feature-development workflow INSIDE the
 *      existing Expo scaffold (apps/website/demo/login-app) with a SCRIPTED
 *      model router + dry-run adapters (no model download, no network, no
 *      simulator) — deterministic and repeatable, exactly like the cli-app
 *      demo but with the Expo project shape;
 *   2. publishes the completion proof into the tracked docs/vectalon/ tree
 *      (phase documents + workflow-state.json + manifest.json) so the paper
 *      trail survives clones even though .vectalon/ is gitignored.
 *
 * The same replay is the CI golden test (__tests__/workflows/goldenFeatureWorkflow.test.ts),
 * so the demo and the test can never drift apart. The generated source
 * (screen/hook/service/tests) ships the updated templates — Pressable over
 * TouchableOpacity, ternaries over `{x && <Component />}`.
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

const { runGoldenFeatureWorkflow, publishPaperTrail } = require('../dist/testing/goldenWorkflow')
const repoRoot = path.resolve(rnRoot, '..', '..')
const demoDir = path.join(repoRoot, 'apps', 'website', 'demo', 'login-app')

const EXPO_FEATURE_PROMPT = 'create a login screen with email password'

async function main() {
  console.log(`Replaying golden workflow at ${demoDir}`)
  mkdirSync(demoDir, { recursive: true })

  const kinds = []
  const state = await runGoldenFeatureWorkflow(demoDir, {
    prompt: EXPO_FEATURE_PROMPT,
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
    projectName: 'login-app',
    rnVersion: '0.79.0',
    tooling: 'expo',
    expoSdkVersion: '~53.0.0',
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
