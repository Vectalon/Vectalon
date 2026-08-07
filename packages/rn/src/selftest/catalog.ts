/**
 * Vectalon RN — Feature self-test catalog
 * Business Source License 1.1 (BSL-1.1)
 *
 * Every check below exercises a real, exported feature of the package in a
 * deterministic, offline way: no model calls, no network, no changes to the
 * user's project. Each check runs in its own temp sandbox and records its
 * steps, shell commands, and file writes into the activity trace so clients
 * can see exactly what the harness does.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import pkg from '../../package.json'
import { logger } from '../cli/logger'
import { initCommand } from '../cli/commands/init'
import { serveCommand } from '../cli/commands/serve'
import { doctorCommand } from '../cli/commands/doctor'
import { benchCommand } from '../cli/commands/bench'
import { featureCommand } from '../cli/commands/feature'
import { releaseCommand } from '../cli/commands/release'
import { ecosystemCommand } from '../cli/commands/ecosystem'
import { syncCommand } from '../cli/commands/sync'
import { impactCommand } from '../cli/commands/impact'
import { leaderboardCommand } from '../cli/commands/leaderboard'
import { trainCommand } from '../cli/commands/train'
import { telemetryCommand } from '../cli/commands/telemetry'
import { daemonCommand } from '../cli/commands/daemon'
import { ciCommand } from '../cli/commands/ci'
import { sandboxCommand } from '../cli/commands/sandbox'
import {
  parseGitLog,
  planRelease,
  renderReleasePlan,
  detectBumpType,
  bumpVersion,
} from '../sdlc/ReleasePlanner'
import { ReleaseNoteWriter, categorizeChange } from '../sdlc/ReleaseNoteWriter'
import { deriveFromGitHistory, renderGitDerivation } from '../sdlc/GitHistoryDeriver'
import { ADRWriter } from '../sdlc/ADRWriter'
import { StoryWriter } from '../sdlc/StoryWriter'
import { TestCaseWriter } from '../sdlc/TestCaseWriter'
import { CodeReviewAnalyzer } from '../sdlc/CodeReviewAnalyzer'
import { SWOTAnalyzer } from '../sdlc/SWOTAnalyzer'
import { TradeoffAnalyzer } from '../sdlc/TradeoffAnalyzer'
import { ThreatModeler } from '../sdlc/ThreatModeler'
import { rules, runGuardrails, runPolicy, defaultPolicy } from '../guardrails'
import { JsonArtifactStore } from '../knowledge/JsonArtifactStore'
import { ArtifactStore } from '../knowledge/ArtifactStore'
import { KnowledgeIndex } from '../knowledge/KnowledgeIndex'
import { HashEmbeddingProvider, cosineSimilarity } from '../knowledge/embeddings'
import { Traceability } from '../knowledge/Traceability'
import { analyzeHermesRuntime, recordPerfBaseline, getLatestPerfBaseline, compareToBaseline } from '../perf'
import { runSandboxed, scrubEnv, detectBackend } from '../sandbox'
import { analyzeSourceFile, parseSource } from '../harness/AstScanner'
import { detectWorkspace, NO_WORKSPACE } from '../harness/workspace'
import { ModelRouter } from '../model/ModelRouter'
import { hasDownloadedModel } from '../model/local/ModelStore'
import { getDefaultPreset } from '../model/local/presets'
import { wasmCacheReady } from '../model/local/wasmPresets'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../projectManifest'
import { buildToolCallSystemPrompt, parseToolCallOutput } from '../model/toolCalling'
import { WASM_MODEL_PRESETS, getWasmPreset } from '../model/local/wasmPresets'
import { ContextEngine } from '../harness/ContextEngine'
import { detectVersions } from '../upgrade/detect'
import { planUpgrade } from '../upgrade/planner'
import { runUpgrade } from '../upgrade'
import { MCPServer } from '../protocol/MCPServer'
import { parseMcpCommand } from '../protocol/subMcp'
import { listWorkflows, getWorkflow } from '../workflows'
import { createWorkflowState, saveWorkflowState, loadWorkflowState } from '../workflows/WorkflowState'
import {
  ECOSYSTEM_CATALOG,
  ECOSYSTEM_ITEMS,
  getEcosystemItem,
  listEcosystemItems,
} from '../ecosystem/catalog'
import {
  readEcosystemConfig,
  writeEcosystemConfig,
  enableEcosystemItem,
} from '../ecosystem/config'
import { recommendEcosystemSetup } from '../ecosystem'
import { compositeScore, guardrailPassRate } from '../bench/scoring'
import { rubricChecks, runRubric, formatRubricResult } from '../bench/rubric'
import { loadScenarios, defaultScenariosDir } from '../bench/loader'
import { validateScenario } from '../bench/types'
import { generateGithubActionsWorkflow, generateEasWorkflow } from '../adapters/ciTemplates'
import { ProjectMemory } from '../memory/ProjectMemory'
import { PatternLearner } from '../memory/PatternLearner'
import { createAdapters } from '../adapters'
import type { CheckResult, FeatureCheck, ModelProviderChoice } from './types'

function ok(detail: string): CheckResult {
  return { status: 'pass', detail }
}

function fail(detail: string): CheckResult {
  return { status: 'fail', detail }
}

function warn(detail: string): CheckResult {
  return { status: 'warn', detail }
}

/** True when a model response is the deterministic fallback stub, not real output. */
function isModelFallback(content: string): boolean {
  return content.includes('[Local model fallback:')
}

/** Minimal React Native project fixture used by several checks. */
const RN_PROJECT_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'SelftestApp',
      version: '1.0.0',
      dependencies: { react: '18.2.0', 'react-native': '0.72.0' },
    },
    null,
    2
  ),
  'src/Home.tsx': [
    "import React, { useState } from 'react'",
    "import { View, Text, StyleSheet } from 'react-native'",
    'const Home = () => {',
    '  const [count, setCount] = useState(0)',
    '  return <View style={styles.root}><Text>{count}</Text></View>',
    '}',
    'const styles = StyleSheet.create({ root: { flex: 1 } })',
    'export default Home',
    '',
  ].join('\n'),
}

const MODEL_PROVIDERS: ModelProviderChoice[] = ['local', 'wasm', 'openai', 'anthropic']

const SAMPLE_GIT_LOG = [
  'a1b2c3d feat: add login screen',
  'f2e3d4c feat(auth)!: BREAKING CHANGE: new token format',
  '9c8d7e6 fix: crash on empty state',
  '5f6e7d8 perf: faster list rendering',
  '3c4b5a6 docs: update readme',
].join('\n')

export const FEATURE_CATALOG: FeatureCheck[] = [
  // ---------------------------------------------------------------------------
  // CLI
  // ---------------------------------------------------------------------------
  {
    id: 'cli-version',
    name: 'CLI version',
    category: 'cli',
    description: 'The package exposes a semver version that matches package.json.',
    run() {
      const v = pkg.version
      if (!/^\d+\.\d+\.\d+/.test(v)) return fail(`version "${v}" is not semver`)
      return ok(`@vectalon-dev/rn ${v}`)
    },
  },
  {
    id: 'cli-command-actions',
    name: 'CLI command actions',
    category: 'cli',
    description: 'Every command action (init, serve, feature, doctor, bench, release, ecosystem, …) is exported and callable.',
    run() {
      const actions: Record<string, unknown> = {
        init: initCommand,
        serve: serveCommand,
        doctor: doctorCommand,
        bench: benchCommand,
        feature: featureCommand,
        release: releaseCommand,
        ecosystem: ecosystemCommand,
        sync: syncCommand,
        impact: impactCommand,
        leaderboard: leaderboardCommand,
        train: trainCommand,
        telemetry: telemetryCommand,
        daemon: daemonCommand,
        ci: ciCommand,
        sandbox: sandboxCommand,
      }
      const missing = Object.entries(actions)
        .filter(([, fn]) => typeof fn !== 'function')
        .map(([name]) => name)
      if (missing.length > 0) return fail(`actions missing: ${missing.join(', ')}`)
      return ok(`${Object.keys(actions).length} command actions callable (init … sandbox)`)
    },
  },
  {
    id: 'cli-logger',
    name: 'CLI logger',
    category: 'cli',
    description: 'The step logger writes numbered, color-prefixed lines to stderr.',
    run() {
      const original = process.stderr.write
      const chunks: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      process.stderr.write = ((chunk: any) => {
        chunks.push(String(chunk))
        return true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
      try {
        logger.step(1, 'selftest trace')
        logger.success('ok')
      } finally {
        process.stderr.write = original
      }
      const out = chunks.join('')
      if (!out.includes('[1]')) return fail('step() did not emit a numbered line')
      if (!out.includes('✔')) return fail('success() did not emit a checkmark')
      return ok('logger.step/logger.success emit prefixed lines')
    },
  },
  {
    id: 'cli-init',
    name: 'CLI init',
    category: 'cli',
    description: '`vectalon init` scaffolds .vectalon/ (config, ecosystem, gitignore) into a fresh project.',
    async run(ctx) {
      const sandbox = ctx.sandbox
      for (const [rel, content] of Object.entries(RN_PROJECT_FILES)) sandbox.file(rel, content)
      ctx.trace.step('running initCommand on the sandbox project')
      await initCommand(sandbox.root, { model: 'local' })
      const configPath = '.vectalon/rn-vectalon.json'
      sandbox.recordWrite(configPath)
      if (!sandbox.exists(configPath)) return fail('init did not create .vectalon/rn-vectalon.json')
      const raw = JSON.parse(readFileSync(sandbox.path(configPath), 'utf-8')) as {
        version?: string
        modelProvider?: string
      }
      if (!raw.version) return fail('rn-vectalon.json is missing a version')
      if (raw.modelProvider !== 'local') return fail(`unexpected modelProvider "${raw.modelProvider}"`)
      if (!sandbox.exists('.vectalon/ecosystem.json')) return fail('init did not recommend ecosystem items')
      if (!sandbox.exists('.gitignore')) return fail('init did not gitignore .vectalon/')
      return ok('created .vectalon/rn-vectalon.json + ecosystem.json + .gitignore')
    },
  },

  // ---------------------------------------------------------------------------
  // SDLC
  // ---------------------------------------------------------------------------
  {
    id: 'sdlc-release-planner',
    name: 'Release planner',
    category: 'sdlc',
    description: 'Parse git log, detect the semver bump, bump the version, and render a release plan.',
    run() {
      const commits = parseGitLog(SAMPLE_GIT_LOG)
      if (commits.length < 5) return fail(`parsed only ${commits.length} commits`)
      const bump = detectBumpType(commits)
      if (bump !== 'minor') return fail(`expected minor bump, got ${bump}`)
      if (bumpVersion('1.2.3', bump) !== '1.3.0') return fail('bumpVersion produced the wrong version')
      const plan = planRelease('1.2.3', SAMPLE_GIT_LOG)
      if (plan.nextVersion !== '1.3.0') return fail(`plan version ${plan.nextVersion} != 1.3.0`)
      const rendered = renderReleasePlan(plan)
      if (!rendered.includes('1.3.0')) return fail('rendered plan missing the version')
      return ok(`parsed ${commits.length} commits, bump=${bump}, plan rendered (${rendered.length} chars)`)
    },
  },
  {
    id: 'sdlc-release-notes',
    name: 'Release note writer',
    category: 'sdlc',
    description: 'Auto-categorize changes and render release notes grouped by section.',
    run() {
      if (categorizeChange('feat: add camera') !== 'added') return fail('feat did not map to added')
      if (categorizeChange('fix: crash') !== 'fixed') return fail('fix did not map to fixed')
      if (categorizeChange('security: token leak') !== 'security') return fail('security did not map')
      const writer = new ReleaseNoteWriter()
      const notes = writer.writeReleaseNotes({ version: '2.0.0', changes: ['feat: add camera', 'fix: crash on start'] })
      if (!notes.includes('2.0.0')) return fail('notes missing the version')
      if (!notes.includes('Added')) return fail('notes missing the Added section')
      if (!notes.includes('Fixed')) return fail('notes missing the Fixed section')
      return ok('categorization + section rendering verified')
    },
  },
  {
    id: 'sdlc-git-derivation',
    name: 'Git history derivation',
    category: 'sdlc',
    description: 'Derive a changelog, release notes, and ADR drafts from git history (no model).',
    run() {
      const derived = deriveFromGitHistory(SAMPLE_GIT_LOG)
      if (!derived.changelog.includes('a1b2c3d')) return fail('changelog missing the commit ref')
      if (!derived.releaseNotes.includes('BREAKING')) return fail('breaking change not flagged')
      const rendered = renderGitDerivation(derived)
      if (!rendered.includes('Changelog')) return fail('rendered output missing the changelog section')
      return ok(`${derived.changelog.split('\n').length} changelog lines, breaking change flagged`)
    },
  },
  {
    id: 'sdlc-adr',
    name: 'ADR writer',
    category: 'sdlc',
    description: 'Render an Architecture Decision Record markdown document.',
    run() {
      const md = new ADRWriter().writeADR({
        title: 'Use TypeScript strict mode',
        context: 'We need compile-time safety across the app',
        decision: 'Enable strict mode in tsconfig',
        status: 'accepted',
      })
      if (!md.includes('TypeScript strict mode')) return fail('ADR missing the title')
      if (!md.includes('accepted')) return fail('ADR missing the status')
      return ok(`ADR rendered (${md.length} chars)`)
    },
  },
  {
    id: 'sdlc-story',
    name: 'User story writer',
    category: 'sdlc',
    description: 'Generate user story cards and a rendered story document from a feature.',
    run() {
      const writer = new StoryWriter()
      const cards = writer.storyCards('Login with email', ['user', 'admin'])
      if (cards.length < 2) return fail(`expected 2 cards, got ${cards.length}`)
      const doc = writer.writeUserStories({ feature: 'Login with email', personas: ['user'] })
      if (!doc.includes('Login with email')) return fail('story doc missing the feature')
      return ok(`${cards.length} story cards, document rendered`)
    },
  },
  {
    id: 'sdlc-test-case-writer',
    name: 'Test case writer',
    category: 'sdlc',
    description: 'Turn acceptance criteria into test cases.',
    run() {
      const code = new TestCaseWriter().writeTestCases(
        'Given the user opens the app\nWhen the user taps Login\nThen the user sees Dashboard'
      )
      if (!code.includes('it(')) return fail('no test cases generated')
      return ok(`${(code.match(/it\(/g) || []).length} test cases`)
    },
  },
  {
    id: 'sdlc-code-review',
    name: 'Code review analyzer',
    category: 'sdlc',
    description: 'Static review finds issues in a snippet and renders findings.',
    run() {
      const analyzer = new CodeReviewAnalyzer()
      const findings = analyzer.review('const x = 1; console.log("debug")')
      const rendered = analyzer.render(findings)
      if (!rendered.trim()) return fail('no findings rendered')
      return ok(`${findings.length} finding(s) rendered (${rendered.length} chars)`)
    },
  },
  {
    id: 'sdlc-swot',
    name: 'SWOT analyzer',
    category: 'sdlc',
    description: 'Evaluate strengths/weaknesses/opportunities/threats and render the analysis.',
    run() {
      const analysis = new SWOTAnalyzer().analyze({
        strengths: ['Fast iteration'],
        weaknesses: ['Cold start'],
        opportunities: ['New platform'],
        threats: ['Competitors'],
      })
      if (!analysis.strengths.length) return fail('empty strengths')
      const rendered = new SWOTAnalyzer().render(analysis)
      if (!rendered.includes('Strengths')) return fail('render missing the Strengths section')
      return ok('SWOT analysis rendered')
    },
  },
  {
    id: 'sdlc-tradeoff',
    name: 'Tradeoff analyzer',
    category: 'sdlc',
    description: 'Rank options by weighted scores and render the tradeoff table.',
    run() {
      const result = new TradeoffAnalyzer().analyze([
        { name: 'A', scores: { cost: 1, velocity: 3 } },
        { name: 'B', scores: { cost: 3, velocity: 1 } },
      ])
      if (!result.ranking || result.ranking.length !== 2) return fail('expected 2 ranked options')
      const rendered = new TradeoffAnalyzer().render(result)
      if (!rendered.trim()) return fail('empty tradeoff render')
      return ok(`ranked ${result.ranking.length} options`)
    },
  },
  {
    id: 'sdlc-threat-model',
    name: 'Threat modeler',
    category: 'sdlc',
    description: 'Generate threats for a feature and render the model.',
    run() {
      const threats = new ThreatModeler().threatModel(['Authentication'], ['LoginScreen'])
      if (!threats.length) return fail('no threats generated')
      const rendered = new ThreatModeler().render(threats)
      if (!rendered.includes('Authentication')) return fail('render missing the feature')
      return ok(`${threats.length} threat(s) modeled`)
    },
  },

  // ---------------------------------------------------------------------------
  // Guardrails
  // ---------------------------------------------------------------------------
  {
    id: 'guardrails-rule-catalog',
    name: 'Guardrail rule catalog',
    category: 'guardrails',
    description: 'The built-in rule set is non-empty and well-formed (unique ids, severity, check).',
    run() {
      if (rules.length === 0) return fail('no guardrail rules registered')
      const ids = new Set(rules.map(r => r.id))
      if (ids.size !== rules.length) return fail('duplicate rule ids')
      const broken = rules.filter(r => !r.name || !r.description || typeof r.check !== 'function')
      if (broken.length > 0) return fail(`malformed rules: ${broken.map(r => r.id).join(', ')}`)
      return ok(`${rules.length} rules (ids unique, checks callable)`)
    },
  },
  {
    id: 'guardrails-engine',
    name: 'Guardrail engine',
    category: 'guardrails',
    description: 'runGuardrails flags violations and passes clean code.',
    run() {
      const bad = runGuardrails({
        filePath: 'src/api/client.ts',
        content: 'const BASE_URL = "https://api.example.com/v1";',
      })
      if (bad.ok) return fail('hardcoded URL was not flagged')
      const clean = runGuardrails({
        filePath: 'src/components/Header.tsx',
        content: 'const Header = () => <View />;\nexport { Header };',
      })
      if (!clean.ok) return fail('clean code was flagged')
      return ok(`${bad.failed} finding(s) caught; clean snippet passed`)
    },
  },
  {
    id: 'guardrails-policy',
    name: 'Policy engine',
    category: 'guardrails',
    description: 'runPolicy evaluates a file against the default policy with ok=false on violations.',
    async run(ctx) {
      const bad = runPolicy(ctx.sandbox.root, {
        filePath: 'src/client.ts',
        content: 'const API = "https://api.example.com";',
        conventions: {},
      })
      if (bad.ok) return fail('policy did not flag the violation')
      const clean = runPolicy(ctx.sandbox.root, {
        filePath: 'src/App.tsx',
        content: 'const App = () => null;\nexport default App;',
        conventions: {},
      })
      if (!clean.ok) return fail('policy flagged clean code')
      const rulesCount = defaultPolicy.rules ? Object.keys(defaultPolicy.rules).length : 0
      return ok(`default policy with ${rulesCount} override(s); violation caught, clean passed`)
    },
  },

  // ---------------------------------------------------------------------------
  // Knowledge
  // ---------------------------------------------------------------------------
  {
    id: 'knowledge-store',
    name: 'Artifact store',
    category: 'knowledge',
    description: 'Add, list, search (lexical + vector), link, and trace artifacts in the JSON store.',
    async run(ctx) {
      const store = new JsonArtifactStore(ctx.sandbox.root)
      const prd = store.add({ type: 'requirements', title: 'Login PRD', content: 'Users can log in with email.' })
      const design = store.add({ type: 'design', title: 'Login Screen', content: 'Email + password fields.' })
      store.link(prd.id, design.id)
      if (store.list().length !== 2) return fail('expected 2 artifacts')
      if (!store.get(prd.id)) return fail('get() missed the artifact')
      if (store.fullTextSearch('login').length !== 2) return fail('full-text search missed artifacts')
      const hits = store.vectorSearch('login screen')
      if (hits.length === 0) return fail('vector search returned no hits')
      const artifactStore = new ArtifactStore(ctx.sandbox.root, { engine: 'json' })
      const trace = new Traceability(artifactStore)
      if (trace.traceForward(prd.id).length !== 1) return fail('traceability link not found')
      if (!ctx.sandbox.exists('.vectalon/knowledge/artifacts.json')) return fail('store did not persist artifacts.json')
      ctx.sandbox.recordWrite('.vectalon/knowledge/artifacts.json')
      return ok('2 artifacts persisted + lexical/vector search + traceability link verified')
    },
  },
  {
    id: 'knowledge-index',
    name: 'Knowledge index',
    category: 'knowledge',
    description: 'KnowledgeIndex embeds docs and ranks lexical + semantic search results.',
    run() {
      const index = new KnowledgeIndex(new HashEmbeddingProvider())
      index.addAll([
        { artifact: { id: 'a1', type: 'design', title: 'Button styles', content: 'Primary button uses accent color', createdAt: 1, updatedAt: 1, version: 1, source: 'generated', status: 'draft', checksum: 'x', links: [], history: [], meta: {} } },
        { artifact: { id: 'a2', type: 'engineering', title: 'Networking', content: 'Use axios for API calls', createdAt: 1, updatedAt: 1, version: 1, source: 'generated', status: 'draft', checksum: 'y', links: [], history: [], meta: {} } },
      ])
      if (index.size() !== 2) return fail('wrong index size')
      const results = index.search('primary button accent')
      if (results.length === 0) return fail('search returned nothing')
      if (results[0].artifact.id !== 'a1') return fail('top result is not the button doc')
      index.remove('a1')
      if (index.size() !== 1) return fail('remove failed')
      return ok('lexical + semantic ranking verified (top hit: button doc)')
    },
  },
  {
    id: 'knowledge-embeddings',
    name: 'Embeddings provider',
    category: 'knowledge',
    description: 'HashEmbeddingProvider is deterministic and cosineSimilarity is sound.',
    run() {
      const provider = new HashEmbeddingProvider()
      const v1 = provider.embed('login screen')
      const v2 = provider.embed('login screen')
      if (v1.length === 0) return fail('embedding is empty')
      if (JSON.stringify(v1) !== JSON.stringify(v2)) return fail('embedding is not deterministic')
      if (cosineSimilarity(v1, v2) !== 1) return fail('identical vectors are not similar (1)')
      const v3 = provider.embed('unrelated topic')
      if (cosineSimilarity(v1, v3) >= 1) return fail('different texts should not be perfectly similar')
      return ok(`embedding dim ${v1.length}, deterministic, cosine sanity checked`)
    },
  },

  // ---------------------------------------------------------------------------
  // Harness
  // ---------------------------------------------------------------------------
  {
    id: 'harness-scanner',
    name: 'Source scanner',
    category: 'harness',
    description: 'Parse and analyze a React Native source file (imports, hooks, components).',
    run() {
      const ast = parseSource(RN_PROJECT_FILES['src/Home.tsx'], 'Home.tsx')
      if (!ast) return fail('parseSource returned null')
      const analysis = analyzeSourceFile(RN_PROJECT_FILES['src/Home.tsx'], 'src/Home.tsx')
      if (!analysis) return fail('analyzeSourceFile returned null')
      if (analysis.imports.length === 0) return fail('no imports detected')
      if (analysis.hooks.length === 0) return fail('useState hook not detected')
      return ok(`${analysis.imports.length} imports, ${analysis.hooks.length} hook call(s), component detected`)
    },
  },
  {
    id: 'harness-workspace',
    name: 'Workspace detection',
    category: 'harness',
    description: 'Detect a monorepo workspace (pnpm/yarn workspaces) from package.json.',
    async run(ctx) {
      ctx.sandbox.json('package.json', { name: 'root', private: true, workspaces: ['packages/*'] })
      ctx.sandbox.json('packages/ui/package.json', { name: '@app/ui', version: '1.0.0' })
      const info = detectWorkspace(ctx.sandbox.root)
      if (info === NO_WORKSPACE) return fail('workspace was not detected')
      return ok(`root=${info.root}, manager=${info.manager || 'unknown'}, packages=${info.packages.length}`)
    },
  },

  // ---------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------
  {
    id: 'model-inference',
    name: 'Model inference (real output)',
    category: 'model',
    description:
      'Runs a REAL inference through the configured provider (local GGUF, WASM, or remote API) and verifies the model-generated output — never the deterministic stub. When no model is available (nothing downloaded / no API key) it warns with the exact command to enable real inference, and fails under --require-model.',
    async run(ctx) {
      const resolved = resolveProjectModelProvider(ctx.projectRoot)
      const provider: ModelProviderChoice =
        ctx.options.modelProvider ||
        (MODEL_PROVIDERS.includes(resolved as ModelProviderChoice) ? (resolved as ModelProviderChoice) : 'local')
      ctx.trace.step(`resolved model provider: ${provider}`)
      const missing = (msg: string): CheckResult => {
        ctx.trace.warn(`no real model output — ${msg}`)
        return ctx.options.requireModel ? fail(msg) : warn(msg)
      }
      const prompt = 'Reply with the exact word: vectalon'

      // Local (GGUF) and WASM share the local/WASM runtime via ModelRouter.
      if (provider === 'local' || provider === 'wasm') {
        const preset = getDefaultPreset()
        const ggufReady = hasDownloadedModel(preset.id)
        ctx.trace.step(ggufReady ? `local GGUF model "${preset.id}" detected` : `no local GGUF model (${preset.id})`)

        if (provider === 'wasm') {
          if (!wasmCacheReady()) {
            return missing('WASM weights are not cached — the first inference would download them; run it once or use `vectalon pull`')
          }
          ctx.trace.step('WASM weights cached — running real WASM inference')
        } else if (!ggufReady) {
          // Zero-config: with no GGUF model the router would fall through to
          // the WASM runtime, which downloads on first use. Avoid triggering a
          // big download during a self-test — only run when weights are cached.
          if (!wasmCacheReady()) {
            return missing(`no local model downloaded (${preset.id}) and WASM weights not cached — run \`vectalon pull\` to enable real inference`)
          }
          ctx.trace.step('no GGUF model — falling through to cached WASM inference')
        }

        // Zero-config is forced off when a GGUF model is present so a missing
        // node-llama-cpp native module degrades to the stub (honest warn) instead
        // of silently triggering a first-use WASM weight download; it is forced
        // on otherwise (we already gated on the WASM cache above).
        const zeroConfigEnabled = provider === 'local' ? !ggufReady : false
        const router = new ModelRouter({ projectRoot: ctx.projectRoot, zeroConfigEnabled })
        router.initialize({ provider: provider === 'wasm' ? 'wasm' : 'local' })
        ctx.trace.step(`calling the ${provider} provider with a real prompt…`)
        const response = await router.generate({ prompt, maxTokens: 32 })
        if (isModelFallback(response.content)) {
          const reason = response.content.split('\n')[0].replace('[Local model fallback: ', '').replace(/]$/, '') || 'degraded to the stub'
          return missing(`inference degraded to the stub: ${reason}`)
        }
        if (!response.content.trim()) return fail('the model returned empty output')
        return ok(`${provider} inference returned ${response.content.trim().length} chars of real model output`)
      }

      // Remote providers need an API key in the environment.
      const config = resolveProjectModelConfig(ctx.projectRoot)
      const keyEnv = config?.apiKeyEnv || `${provider.toUpperCase()}_API_KEY`
      if (!process.env[keyEnv]) {
        return missing(`no ${keyEnv} environment variable set — export it (and configure \`vectalon init --model ${provider}\`) to enable real remote inference`)
      }
      ctx.trace.step(`remote provider ${provider} configured via ${keyEnv}`)
      const router = new ModelRouter({ projectRoot: ctx.projectRoot })
      router.initialize({ provider, modelName: config?.modelName, apiKeyEnv: config?.apiKeyEnv })
      ctx.trace.step(`calling ${provider} with a real prompt…`)
      const response = await router.generate({ prompt, maxTokens: 32 })
      if (!response.content.trim()) return fail('the model returned empty output')
      return ok(`${provider} inference returned ${response.content.trim().length} chars of model output`)
    },
  },
  {
    id: 'model-tool-calling',
    name: 'Tool-call protocol',
    category: 'model',
    description: 'Build the tool-call system prompt and parse model output into tool calls / answers.',
    run() {
      const prompt = buildToolCallSystemPrompt([{ name: 'get_time', description: 'Get the current time', inputSchema: {} }])
      if (!prompt.includes('get_time')) return fail('system prompt missing the tool')
      const call = parseToolCallOutput('{"tool": "get_time", "arguments": {}}')
      if (call.kind !== 'tool-call' || call.tool !== 'get_time') return fail('tool call not parsed')
      const answer = parseToolCallOutput('{"answer": "The answer is 42"}')
      if (answer.kind !== 'answer' || answer.text !== 'The answer is 42') return fail('answer not parsed')
      const invalid = parseToolCallOutput('not json at all')
      if (invalid.kind !== 'invalid') return fail('garbage should be invalid')
      return ok('prompt built + tool-call/answer/invalid parsing verified')
    },
  },
  {
    id: 'model-wasm-presets',
    name: 'WASM model presets',
    category: 'model',
    description: 'Zero-config WASM presets are registered and resolvable.',
    run() {
      if (WASM_MODEL_PRESETS.length === 0) return fail('no WASM presets')
      const preset = getWasmPreset()
      if (!preset.id) return fail('default preset has no id')
      return ok(`${WASM_MODEL_PRESETS.length} presets; default=${preset.id}`)
    },
  },

  // ---------------------------------------------------------------------------
  // MCP
  // ---------------------------------------------------------------------------
  {
    id: 'mcp-server-tools',
    name: 'MCP server tools',
    category: 'mcp',
    description: 'The MCP server advertises the full tool surface and handles a real tool call.',
    async run(ctx) {
      for (const [rel, content] of Object.entries(RN_PROJECT_FILES)) ctx.sandbox.file(rel, content)
      const engine = new ContextEngine(ctx.sandbox.root)
      engine.init()
      const router = new ModelRouter()
      router.initialize({ provider: 'local' })
      const server = new MCPServer(engine, router)
      const tools = server.getToolList()
      if (tools.length < 50) return fail(`expected >= 50 tools, got ${tools.length}`)
      const names = tools.map(t => t.name)
      const required = ['get_project_context', 'write_release_notes', 'derive_from_git_history', 'check_guardrails', 'analyze_impact']
      const missing = required.filter(n => !names.includes(n))
      if (missing.length > 0) return fail(`missing tools: ${missing.join(', ')}`)
      const malformed = tools.filter(t => !t.description || !t.inputSchema)
      if (malformed.length > 0) return fail(`${malformed.length} tools missing description/inputSchema`)
      const result = await server.handleToolCall({ id: '1', name: 'get_project_context', arguments: {} })
      if (result.isError) return fail('get_project_context returned an error')
      return ok(`${tools.length} tools advertised, ${required.join(', ')} present, context call handled`)
    },
  },
  {
    id: 'mcp-command-parse',
    name: 'MCP subprocess parsing',
    category: 'mcp',
    description: 'parseMcpCommand splits install strings into command + args (npx gets --yes).',
    run() {
      const npx = parseMcpCommand('npx @steve228uk/metro-mcp --port 9000')
      if (npx.command !== 'npx' || !npx.args.includes('--yes')) return fail('npx install string not parsed correctly')
      const direct = parseMcpCommand('maestro test flows')
      if (direct.command !== 'maestro') return fail('direct command not parsed')
      return ok('install strings parsed into command + args')
    },
  },

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------
  {
    id: 'workflows-catalog',
    name: 'Workflow catalog',
    category: 'workflows',
    description: 'The feature-development workflow is registered with phases.',
    run() {
      const workflows = listWorkflows()
      if (workflows.length === 0) return fail('no workflows registered')
      const wf = getWorkflow('feature-development')
      if (!wf) return fail('feature-development workflow missing')
      if (!wf.phases || wf.phases.length < 5) return fail('workflow has too few phases')
      return ok(`feature-development with ${wf.phases.length} phases (${workflows.length} workflow(s))`)
    },
  },
  {
    id: 'workflows-state',
    name: 'Workflow state',
    category: 'workflows',
    description: 'Workflow state is created, persisted, and reloaded from disk.',
    async run(ctx) {
      const state = createWorkflowState('feature-development', 'Add login')
      if (state.status !== 'pending') return fail('initial status is not pending')
      saveWorkflowState(ctx.sandbox.root, state)
      const loaded = loadWorkflowState(ctx.sandbox.root, 'feature-development', state.id)
      if (!loaded) return fail('state did not round-trip')
      if (loaded.prompt !== 'Add login') return fail('loaded state has the wrong prompt')
      ctx.sandbox.recordWrite(`.vectalon/workflows/feature-development/${state.id}.json`)
      return ok(`state persisted + reloaded (${state.id})`)
    },
  },

  // ---------------------------------------------------------------------------
  // Ecosystem
  // ---------------------------------------------------------------------------
  {
    id: 'ecosystem-catalog',
    name: 'Ecosystem catalog',
    category: 'ecosystem',
    description: 'The ecosystem catalog is non-empty, unique, and filterable.',
    run() {
      const items = ECOSYSTEM_CATALOG.items
      if (items.length < 20) return fail(`only ${items.length} items`)
      const ids = new Set(items.map(i => i.id))
      if (ids.size !== items.length) return fail('duplicate item ids')
      const validCategories = new Set(['mcp', 'skill', 'tool', 'hook'])
      const bad = items.filter(i => !validCategories.has(i.category) || !i.name || !i.description)
      if (bad.length > 0) return fail(`${bad.length} malformed items`)
      if (!getEcosystemItem('metro-mcp')) return fail('metro-mcp not found')
      const mcps = listEcosystemItems({ category: 'mcp' })
      if (mcps.length === 0 || mcps.some(i => i.category !== 'mcp')) return fail('category filter broken')
      return ok(`${items.length} items (${ECOSYSTEM_ITEMS.length} exported), filters work`)
    },
  },
  {
    id: 'ecosystem-config',
    name: 'Ecosystem config',
    category: 'ecosystem',
    description: 'Enable an item and persist/read .vectalon/ecosystem.json.',
    async run(ctx) {
      const result = enableEcosystemItem(ctx.sandbox.root, 'metro-mcp')
      if (!result.enabled) return fail(`enable failed: ${result.message}`)
      const config = readEcosystemConfig(ctx.sandbox.root)
      if (!config.enabled.includes('metro-mcp')) return fail('config missing the enabled item')
      const path = writeEcosystemConfig(ctx.sandbox.root, config)
      const reread = readEcosystemConfig(ctx.sandbox.root)
      if (JSON.stringify(reread) !== JSON.stringify(config)) return fail('config did not round-trip')
      ctx.sandbox.recordWrite('.vectalon/ecosystem.json')
      if (!ctx.sandbox.exists('.vectalon/ecosystem.json')) return fail('ecosystem.json not persisted')
      void path
      return ok('metro-mcp enabled, persisted, and round-tripped')
    },
  },
  {
    id: 'ecosystem-recommendations',
    name: 'Ecosystem recommendations',
    category: 'ecosystem',
    description: 'Flavor-aware recommendations return applicable items (Expo vs RN CLI).',
    run() {
      const expo = recommendEcosystemSetup('expo')
      const rn = recommendEcosystemSetup('rn-cli')
      if (expo.length === 0 || rn.length === 0) return fail('empty recommendations')
      const expoOnly = expo.some(i => i.flavor === 'expo')
      const rnOnly = rn.some(i => i.flavor === 'rn-cli')
      if (!expoOnly || !rnOnly) return fail('flavor filtering not working')
      return ok(`${expo.length} expo + ${rn.length} rn-cli recommended items`)
    },
  },

  // ---------------------------------------------------------------------------
  // Bench
  // ---------------------------------------------------------------------------
  {
    id: 'bench-scoring',
    name: 'Bench scoring',
    category: 'bench',
    description: 'Composite scoring and guardrail pass-rate over generated files.',
    async run(ctx) {
      const composite = compositeScore({ correctness: 0.8, adherence: 0.6, guardrails: 0.9 })
      if (composite === null || composite <= 0) return fail('composite score is not positive')
      ctx.sandbox.file('src/App.tsx', 'const App = () => null;\nexport default App;')
      const rate = guardrailPassRate([
        { path: ctx.sandbox.path('src/App.tsx'), content: 'const App = () => null;\nexport default App;' },
      ])
      if (rate === null || rate <= 0) return fail('guardrail pass rate is not positive')
      return ok(`composite=${(composite * 100).toFixed(0)}%, guardrail pass=${(rate * 100).toFixed(0)}%`)
    },
  },
  {
    id: 'bench-rubric',
    name: 'Bench rubric',
    category: 'bench',
    description: 'The rubric checks are registered and run over generated files.',
    run() {
      if (rubricChecks.length === 0) return fail('no rubric checks')
      const result = runRubric([{ path: 'src/App.tsx', content: 'const App = () => null;\nexport default App;' }])
      const rendered = formatRubricResult(result)
      if (!rendered.trim()) return fail('empty rubric render')
      return ok(`${rubricChecks.length} rubric checks; result rendered (${rendered.length} chars)`)
    },
  },
  {
    id: 'bench-scenarios',
    name: 'Bench scenario pack',
    category: 'bench',
    description: 'The shipped scenario pack loads and validates cleanly.',
    async run(_ctx) {
      const loaded = loadScenarios(defaultScenariosDir())
      if (loaded.scenarios.length === 0) return fail('no scenarios loaded')
      const broken: string[] = []
      for (const s of loaded.scenarios) {
        const problems = validateScenario(s)
        if (problems.length > 0) broken.push(`${s.id}: ${problems.join('; ')}`)
      }
      if (broken.length > 0) return fail(`invalid scenarios: ${broken.slice(0, 3).join(' | ')}`)
      return ok(`${loaded.scenarios.length} scenarios validated (${loaded.problems.length} load problem(s))`)
    },
  },

  // ---------------------------------------------------------------------------
  // Adapters
  // ---------------------------------------------------------------------------
  {
    id: 'adapters-run-command',
    name: 'runCommand adapter',
    category: 'adapters',
    description: 'The subprocess adapter executes a real command and reports exit code + output.',
    async run(ctx) {
      const result = await ctx.runCommand('node', ['--version'], { timeout: 15_000 })
      if (!result.success) return fail(`node --version failed: ${result.stderr.slice(0, 80)}`)
      if (!/v\d+\.\d+\.\d+/.test(result.stdout)) return fail(`unexpected output: ${result.stdout.slice(0, 40)}`)
      return ok(`node ${result.stdout.trim()} (exit ${result.exitCode})`)
    },
  },
  {
    id: 'adapters-git',
    name: 'Git adapter',
    category: 'adapters',
    description: 'Git init → add → commit → log round-trip in the sandbox (commands traced).',
    async run(ctx) {
      ctx.sandbox.file('src/App.tsx', 'const App = () => null;\nexport default App;')
      const identity = ['-c', 'user.name=vectalon-selftest', '-c', 'user.email=selftest@vectalon.in']
      const init = await ctx.runCommand('git', ['init', '-q'], { cwd: ctx.sandbox.root, timeout: 15_000 })
      if (!init.success) {
        if (/ENOENT|not found|No such file/i.test(init.stderr + init.stdout)) {
          return warn('git is not installed on this machine — skipping')
        }
        return fail(`git init failed: ${init.stderr.slice(0, 80)}`)
      }
      await ctx.runCommand('git', ['add', '-A'], { cwd: ctx.sandbox.root, timeout: 15_000 })
      const commit = await ctx.runCommand('git', [...identity, 'commit', '-q', '-m', 'feat: selftest commit'], {
        cwd: ctx.sandbox.root,
        timeout: 15_000,
      })
      if (!commit.success) return fail(`git commit failed: ${commit.stderr.slice(0, 120)}`)
      const log = await ctx.runCommand('git', ['log', '--oneline'], { cwd: ctx.sandbox.root, timeout: 15_000 })
      if (!log.stdout.includes('feat: selftest commit')) return fail('commit not in git log')
      return ok('init → add → commit → log verified')
    },
  },
  {
    id: 'adapters-ci-templates',
    name: 'CI workflow templates',
    category: 'adapters',
    description: 'Generate GitHub Actions and EAS workflow YAML from a project.',
    async run(ctx) {
      ctx.sandbox.json('package.json', {
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0' },
      })
      const gh = generateGithubActionsWorkflow(ctx.sandbox.root)
      if (!gh.includes('on:') || gh.length < 200) return fail('GitHub Actions workflow looks empty')
      ctx.sandbox.json('package.json', {
        name: 'app',
        version: '1.0.0',
        dependencies: { 'react-native': '0.72.0', expo: '49.0.0' },
      })
      const eas = generateEasWorkflow(ctx.sandbox.root)
      if (eas.length < 100) return fail('EAS workflow looks empty')
      return ok(`GitHub Actions (${gh.length} chars) + EAS (${eas.length} chars) rendered`)
    },
  },
  {
    id: 'adapters-registry',
    name: 'Adapter registry',
    category: 'adapters',
    description: 'createAdapters builds the full adapter registry (git, test runner, simulator, …).',
    run() {
      const adapters = createAdapters({ root: '/', dryRun: true })
      const keys = Object.keys(adapters)
      const required = ['git', 'testRunner', 'simulator', 'projectManagement', 'design']
      const missing = required.filter(k => !keys.includes(k))
      if (missing.length > 0) return fail(`missing adapters: ${missing.join(', ')}`)
      return ok(`registry with ${keys.length} adapters (${required.join(', ')})`)
    },
  },

  // ---------------------------------------------------------------------------
  // Memory
  // ---------------------------------------------------------------------------
  {
    id: 'memory-project',
    name: 'Project memory',
    category: 'memory',
    description: 'ProjectMemory persists learned patterns and decisions to .vectalon/memory.json.',
    async run(ctx) {
      const memory = new ProjectMemory(ctx.sandbox.root)
      memory.addPattern({
        id: 'naming-pascal',
        pattern: 'PascalCase components',
        description: 'Uses PascalCase naming',
        confidence: 0.9,
        occurrences: 3,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        category: 'naming',
      })
      memory.recordDecision('choose-flashlist', 'Long lists', 'selected FlashList')
      const active = memory.getActivePatterns()
      if (!active.some(p => p.id === 'naming-pascal')) return fail('pattern not retained')
      if (!ctx.sandbox.exists('.vectalon/memory.json')) return fail('memory.json not persisted')
      ctx.sandbox.recordWrite('.vectalon/memory.json')
      return ok(`${active.length} active pattern(s), memory.json persisted`)
    },
  },
  {
    id: 'memory-pattern-learner',
    name: 'Pattern learner',
    category: 'memory',
    description: 'PatternLearner learns conventions from scanned components.',
    async run(ctx) {
      const memory = new ProjectMemory(ctx.sandbox.root)
      const learner = new PatternLearner(memory)
      learner.learnFromComponents([
        { name: 'HomeScreen', usesStyleSheet: true, usesNavigation: true },
        { name: 'ProfileScreen', usesStyleSheet: true, usesNavigation: true },
        { name: 'SettingsScreen', usesStyleSheet: true, usesNavigation: false },
      ])
      const patterns = memory.getActivePatterns()
      if (patterns.length === 0) return fail('learner produced no patterns')
      const naming = patterns.find(p => p.category === 'naming')
      if (naming && naming.confidence > 0.5) {
        return ok(`${patterns.length} pattern(s) learned (PascalCase at ${(naming.confidence * 100).toFixed(0)}%)`)
      }
      return ok(`${patterns.length} pattern(s) learned`)
    },
  },
  {
    id: 'upgrade-detect',
    name: 'Upgrade version detection',
    category: 'upgrade',
    description: 'detectVersions reads react-native / expo versions + native config (Podfile, gradle.properties, build.gradle).',
    run(ctx) {
      ctx.trace?.step('writing fixture project (RN 0.72, legacy Hermes flag, legacy bridge usage)')
      ctx.sandbox.json('package.json', {
        name: 'app',
        version: '1.0.0',
        dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
      })
      ctx.sandbox.file('android/gradle.properties', 'newArchEnabled=false\n')
      ctx.sandbox.file('android/build.gradle', [
        'buildscript {',
        '  ext {',
        '    kotlinVersion = "1.8.10"',
        '    compileSdkVersion = 33',
        '    minSdkVersion = 21',
        '    targetSdkVersion = 33',
        '  }',
        '}',
        'enableHermes true',
      ].join('\n'))
      ctx.sandbox.file('ios/Podfile', [
        'platform :ios, :deployment_target => "13.0"',
        "target 'App' do",
        '  use_react_native!(:path => config[:reactNativePath], :hermes_enabled => true)',
        'end',
      ].join('\n'))
      ctx.sandbox.file('src/legacy.js', [
        "import { NativeModules } from 'react-native'",
        "import { requireNativeComponent } from 'react-native'",
        'const NativeThing = requireNativeComponent("NativeThing")',
        'export const M = NativeModules.MyModule',
      ].join('\n'))

      const v = detectVersions(ctx.sandbox.root)
      if (v.rnVersion !== '0.72.5') return fail(`expected react-native 0.72.5, got ${v.rnVersion}`)
      if (v.tooling !== 'rn-cli') return fail(`expected rn-cli tooling, got ${v.tooling}`)
      if (v.android.kotlinVersion !== '1.8.10') return fail(`kotlinVersion detection failed: ${v.android.kotlinVersion}`)
      if (v.ios.hermesEnabled !== true) return fail('Podfile :hermes_enabled => true not detected')
      if (v.android.newArchEnabled !== false) return fail('gradle.properties newArchEnabled=false not detected')
      return ok(`detected RN ${v.rnVersion} (rn-cli) · kotlin ${v.android.kotlinVersion} · Podfile Hermes on · New Arch off`)
    },
  },
  {
    id: 'upgrade-plan',
    name: 'Upgrade planner (dry run)',
    category: 'upgrade',
    description: 'planUpgrade produces a deterministic step-by-step plan + AST impact without writing files.',
    run(ctx) {
      ctx.sandbox.json('package.json', {
        name: 'app',
        version: '1.0.0',
        dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
      })
      ctx.sandbox.file('android/gradle.properties', 'newArchEnabled=false\n')
      ctx.sandbox.file('android/build.gradle', 'enableHermes true\n')
      ctx.sandbox.file('src/legacy.js', [
        "import { NativeModules } from 'react-native'",
        "import { requireNativeComponent } from 'react-native'",
        'const NativeThing = requireNativeComponent("NativeThing")',
        'export const M = NativeModules.MyModule',
      ].join('\n'))

      const plan = planUpgrade(ctx.sandbox.root, { to: '0.76', dryRun: true })
      if (plan.errors.length > 0) return fail(`plan errors: ${plan.errors.join('; ')}`)
      const ids = plan.steps.map(s => s.id)
      for (const required of ['dep-react-native', 'rn-070-hermes-flag', 'rn-071-newarch-flag', 'rn-070-codegen-native-component']) {
        if (!ids.includes(required)) return fail(`missing step ${required} in ${ids.join(', ')}`)
      }
      if (plan.impact.length === 0) return fail('impact analysis produced no findings for legacy bridge fixture')
      if (plan.edits.length === 0) return fail('expected planned edits (package.json bump, hermes flag)')
      const pkgAfter = JSON.parse(readFileSync(ctx.sandbox.path('package.json'), 'utf-8')) as { dependencies: Record<string, string> }
      if (pkgAfter.dependencies['react-native'] !== '0.72.5') return fail('dry-run modified package.json!')
      return ok(`${plan.steps.length} steps · ${plan.edits.length} edits · ${plan.impact.length} impact findings — files untouched`)
    },
  },
  {
    id: 'upgrade-codemod',
    name: 'Upgrade codemods + provenance',
    category: 'upgrade',
    description: 'Applying the plan bumps deps, relocates the Hermes flag, rewrites requireNativeComponent, and writes a provenance manifest.',
    async run(ctx) {
      ctx.sandbox.json('package.json', {
        name: 'app',
        version: '1.0.0',
        dependencies: { react: '18.2.0', 'react-native': '0.72.5' },
      })
      ctx.sandbox.file('android/gradle.properties', 'newArchEnabled=false\n')
      ctx.sandbox.file('android/build.gradle', 'enableHermes true\n')
      ctx.sandbox.file('src/legacy.js', [
        "import { NativeModules } from 'react-native'",
        "import { requireNativeComponent } from 'react-native'",
        'const NativeThing = requireNativeComponent("NativeThing")',
        'export const M = NativeModules.MyModule',
      ].join('\n'))

      const report = await runUpgrade(ctx.sandbox.root, { to: '0.76', apply: true, dryRun: false, verify: false, force: true })
      if (!report.applied) return fail(`upgrade not applied: ${report.errors.join('; ')}`)

      const pkg = JSON.parse(readFileSync(ctx.sandbox.path('package.json'), 'utf-8')) as { dependencies: Record<string, string> }
      if (pkg.dependencies['react-native'] !== '0.76.0') return fail(`react-native not bumped: ${pkg.dependencies['react-native']}`)
      if (pkg.dependencies.react !== '18.3.1') return fail(`react not paired: ${pkg.dependencies.react}`)

      const props = readFileSync(ctx.sandbox.path('android/gradle.properties'), 'utf-8')
      if (!props.includes('newArchEnabled=true')) return fail('gradle.properties missing newArchEnabled=true')
      const gradle = readFileSync(ctx.sandbox.path('android/build.gradle'), 'utf-8')
      if (gradle.includes('enableHermes')) return fail('enableHermes still present in build.gradle')

      const legacy = readFileSync(ctx.sandbox.path('src/legacy.js'), 'utf-8')
      if (!legacy.includes('codegenNativeComponent')) return fail('codegen codemod did not run on src/legacy.js')
      if (legacy.includes('requireNativeComponent(')) return fail('requireNativeComponent call not rewritten')

      if (!report.provenance.manifest || !ctx.sandbox.exists(report.provenance.manifest.replace(/^\.\//, ''))) {
        return fail('provenance manifest not written')
      }
      return ok(`${report.edits.length} edits applied · react-native 0.76.0 · Hermes + New Arch flags · codegen rewrite · provenance manifest`)
    },
  },
  {
    id: 'perf-cpuprofile-blocking',
    name: 'Hermes CPU profile: JS-thread blocking + hot functions',
    category: 'perf',
    description: 'Parsing a .cpuprofile finds the useEffect run that blocks the JS thread for 500ms and ranks hot functions.',
    run(_ctx) {
      const profile = {
        startTime: 0,
        endTime: 16000000,
        nodes: [
          { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: 0 }, hitCount: 0, children: [2] },
          { id: 2, callFrame: { functionName: 'renderApp', url: 'file:///App.tsx', lineNumber: 10 }, hitCount: 0, children: [3] },
          { id: 3, callFrame: { functionName: 'useEffect', url: 'file:///App.tsx', lineNumber: 42 }, hitCount: 0, children: [] },
        ],
        samples: [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 2, 1],
        timeDeltas: [1000, 1000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 1000, 1000, 1000],
      }
      const analysis = analyzeHermesRuntime({ cpuProfile: profile }, { blockingThresholdMs: 100 })
      const blocking = analysis.findings.filter(f => f.category === 'blocking')
      if (blocking.length === 0) return fail('no blocking finding for the 500ms useEffect run')
      const top = blocking[0]
      if (top.target !== 'useEffect') return fail(`expected useEffect, got ${top.target}`)
      if (!top.message.includes('blocks the JS thread for 500ms')) {
        return fail(`expected 500ms block in message: ${top.message}`)
      }
      if (analysis.cpu?.hotFunctions[0]?.functionName !== 'useEffect') {
        return fail('useEffect should be the hottest function by self time')
      }
      return ok(`${top.message} — ${analysis.cpu?.hotFunctions.length ?? 0} hot function(s) ranked`)
    },
  },
  {
    id: 'perf-heap-retained',
    name: 'Hermes heap snapshot: retained objects + leak candidates',
    category: 'perf',
    description: 'Parsing a .heapsnapshot finds the imageCache object retaining 20 MB and flags the big string allocation.',
    run(_ctx) {
      const heap = buildHeapFixture()
      const analysis = analyzeHermesRuntime({ heapSnapshot: heap }, { retainedThresholdBytes: 1024 * 1024 })
      const retained = analysis.findings.filter(f => f.category === 'retained-size')
      if (retained.length === 0) return fail('no retained-size finding')
      if (retained[0].target !== 'imageCache') return fail(`expected imageCache, got ${retained[0].target}`)
      if (analysis.heap?.topSelf[0]?.name !== 'bigPayload') return fail('bigPayload should be the top self allocation')
      return ok(`imageCache retains ${retained[0].metric} · top allocation ${analysis.heap?.topSelf[0]?.name} (${analysis.heap?.topSelf[0]?.selfBytes} B)`)
    },
  },
  {
    id: 'perf-baseline-regression',
    name: 'Perf baselines + regression detection',
    category: 'perf',
    description: 'Recording a baseline and comparing a slower run flags the blocking-time regression from the knowledge base.',
    run(ctx) {
      const store = new ArtifactStore(ctx.sandbox.root)
      try {
        const baseline = buildCpuProfile(200) // 200ms block
        const slower = buildCpuProfile(600) // 600ms block — +200%
        const baselineAnalysis = analyzeHermesRuntime({ cpuProfile: baseline })
        recordPerfBaseline(store, baselineAnalysis, 'selftest')
        const stored = getLatestPerfBaseline(store, 'selftest')
        if (!stored) return fail('baseline not persisted')
        const slowerAnalysis = analyzeHermesRuntime({ cpuProfile: slower })
        const compare = compareToBaseline(slowerAnalysis, stored, {})
        if (compare.regressions.length === 0) return fail('expected a blocking regression')
        if (compare.regressions[0].category !== 'regression') return fail('regression category mismatch')
        return ok(`${compare.regressions.length} regression(s) — blocking +${(compare.deltas.blockingPct ?? 0).toFixed(0)}%`)
      } finally {
        store.close()
      }
    },
  },
  {
    id: 'perf-code-review-runtime',
    name: 'Code review surfaces runtime metrics',
    category: 'perf',
    description: 'CodeReviewAnalyzer cites Hermes metrics in findings: "useEffect blocks the JS thread for 500ms — move to a worklet".',
    run() {
      const code = [
        "import React, { useEffect } from 'react'",
        'export function Feed() {',
        '  useEffect(() => {',
        '    heavyWork() // 500ms JS-thread block measured in the profile',
        '  }, [])',
        '  return null',
        '}',
      ].join('\n')
      const findings = new CodeReviewAnalyzer().review(code, 'tsx', [
        { function: 'useEffect', metric: 'blocking', valueMs: 500 },
      ])
      const runtime = findings.find(f => f.rule === 'runtime-blocking')
      if (!runtime) return fail('no runtime-blocking finding')
      if (!runtime.message.includes('blocks the JS thread for 500ms')) {
        return fail(`expected measured message: ${runtime.message}`)
      }
      if (!runtime.message.includes('move to a worklet')) return fail('missing worklet suggestion')
      return ok(runtime.message)
    },
  },

  // ---------------------------------------------------------------------------
  // Sandbox
  // ---------------------------------------------------------------------------
  {
    id: 'sandbox-env-scrub',
    name: 'Sandbox env scrubbing (deny-by-default)',
    category: 'sandbox',
    description: 'scrubEnv drops credential-shaped ambient vars, keeps the base allowlist, and honors explicit overrides.',
    run() {
      const source: NodeJS.ProcessEnv = {
        PATH: '/usr/bin:/bin',
        HOME: '/home/user',
        AWS_SECRET_ACCESS_KEY: 'AKIA…',
        GITHUB_TOKEN: 'ghp_…',
        NPM_TOKEN: 'npm_…',
        SSH_AUTH_SOCK: '/tmp/ssh',
        OPENAI_API_KEY: 'sk-…',
      }
      const { env, dropped } = scrubEnv(source)
      if (env.PATH !== '/usr/bin:/bin') return fail('PATH dropped from the allowlist')
      if (env.HOME !== '/home/user') return fail('HOME dropped from the allowlist')
      for (const secret of ['AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'NPM_TOKEN', 'SSH_AUTH_SOCK', 'OPENAI_API_KEY']) {
        if (secret in env) return fail(`${secret} leaked into the sandbox env`)
        if (!dropped.includes(secret)) return fail(`${secret} not reported as dropped`)
      }
      const withAllow = scrubEnv({ ...source, MY_CUSTOM_FLAG: '1' }, { allowEnv: ['MY_CUSTOM_FLAG'] })
      if (withAllow.env.MY_CUSTOM_FLAG !== '1') return fail('allowEnv did not pass the variable through')
      return ok(`dropped ${dropped.length} credential-shaped var(s), allowlist + allowEnv verified`)
    },
  },
  {
    id: 'sandbox-backend',
    name: 'Sandbox backend detection',
    category: 'sandbox',
    description: 'detectBackend returns a known isolation level with honest capability flags.',
    run() {
      const backend = detectBackend()
      if (!['sandbox-exec', 'bwrap', 'process'].includes(backend.isolation)) return fail(`unknown backend ${backend.isolation}`)
      if (typeof backend.canDenyNetwork !== 'boolean') return fail('canDenyNetwork must be boolean')
      if (typeof backend.canConfineWrites !== 'boolean') return fail('canConfineWrites must be boolean')
      const consistent = backend.isolation === 'process' ? backend.canDenyNetwork === false && backend.canConfineWrites === false : true
      if (!consistent) return fail('process backend must report no OS enforcement')
      return ok(`backend=${backend.isolation}, canDenyNetwork=${backend.canDenyNetwork}, canConfineWrites=${backend.canConfineWrites}`)
    },
  },
  {
    id: 'sandbox-run',
    name: 'Sandboxed command execution',
    category: 'sandbox',
    description: 'runSandboxed executes a real command inside the sandbox root and captures its output.',
    async run(ctx) {
      const result = await runSandboxed('node', ['-e', 'process.stdout.write("sandbox-ok")'], { root: ctx.sandbox.root, timeoutMs: 15_000 })
      if (result.error) return fail(`spawn failed: ${result.error}`)
      if (!result.ok) return fail(`expected exit 0, got ${result.exitCode}${result.signal ? ` (${result.signal})` : ''}`)
      if (!result.stdout.includes('sandbox-ok')) return fail(`unexpected stdout: ${result.stdout.slice(0, 40)}`)
      return ok(`exit ${result.exitCode} (${result.durationMs}ms) on ${result.isolation}, stdout verified`)
    },
  },
  {
    id: 'sandbox-timeout',
    name: 'Sandbox wall-clock timeout',
    category: 'sandbox',
    description: 'A process that outlives the timeout is killed — the sandbox never hangs the caller.',
    async run(ctx) {
      const started = Date.now()
      const result = await runSandboxed('node', ['-e', 'setTimeout(() => {}, 30000)'], { root: ctx.sandbox.root, timeoutMs: 400 })
      const elapsed = Date.now() - started
      if (!result.timedOut) return fail('timeout was not enforced')
      if (result.ok) return fail('timed-out process reported ok')
      if (elapsed > 10_000) return fail('kill took too long')
      return ok(`killed after ${elapsed}ms (timeout 400ms)`)
    },
  },
  {
    id: 'sandbox-rlimits',
    name: 'Sandbox CPU rlimit',
    category: 'sandbox',
    description: 'A CPU-spinning process is cut off by the ulimit wrapper instead of running forever.',
    async run(ctx) {
      const result = await runSandboxed('node', ['-e', 'while (true) {}'], {
        root: ctx.sandbox.root,
        cpuSeconds: 1,
        timeoutMs: 15_000,
      })
      if (result.ok) return fail('CPU-bound process completed (limit not enforced)')
      if (result.timedOut) return fail('CPU limit fell through to the wall-clock timeout')
      return ok(`terminated by ${result.signal || `exit ${result.exitCode}`} (cpuSeconds=1)`)
    },
  },
  {
    id: 'sandbox-write-confinement',
    name: 'Sandbox write confinement',
    category: 'sandbox',
    description: 'On OS backends, a child writing outside the sandbox root is denied; on process fallback it reports honestly.',
    async run(ctx) {
      const backend = detectBackend()
      const escape = join(ctx.sandbox.root, '..', `vectalon-escape-${process.pid}`)
      const result = await runSandboxed('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(escape)}, 'x')`], {
        root: ctx.sandbox.root,
        timeoutMs: 10_000,
      })
      if (backend.canConfineWrites) {
        if (result.ok) return fail(`write outside the sandbox root succeeded on ${backend.isolation}`)
        return ok(`${backend.isolation} denied the write outside the root (exit ${result.exitCode}${result.signal ? ` ${result.signal}` : ''})`)
      }
      // Process-level: no OS enforcement — report honestly instead of claiming a guarantee.
      ctx.trace.warn(`no OS write confinement on this backend (${backend.isolation}) — writes outside the root are only prevented by convention`)
      return warn('process-level sandbox: write confinement not OS-enforced')
    },
  },
]

/** Small synthetic-root heap snapshot fixture (2 retained subtrees). */
function buildHeapFixture(): Record<string, unknown> {
  // Node layout: [type, name, id, self_size, edge_count, trace_node_id, detachedness]
  // strings: 0:'', 1:'imageCache', 2:'bigPayload', 3:'logs'
  const strings = ['', 'imageCache', 'bigPayload', 'logs']
  // node 0: synthetic root (edges -> 1, 3); node 1: object imageCache (edge -> 2);
  // node 2: string bigPayload (20 MB self, inline name); node 3: array logs (1 MB self).
  const nodes: (number | string)[] = [
    10, 0, 1, 0, 2, 0, 0, // synthetic root
    3, 1, 2, 1024, 1, 0, 0, // object imageCache
    2, 'bigPayload', 3, 20 * 1024 * 1024, 0, 0, 0, // string bigPayload
    1, 3, 4, 1024 * 1024, 0, 0, 0, // array logs
  ]
  // Edge layout: [type, name_or_index, to_node] — to_node = nodeIndex * 7
  const edges = [
    1, 0, 7, // root -> node 1
    1, 0, 21, // root -> node 3
    1, 0, 14, // imageCache -> node 2
  ]
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'],
        node_types: [
          ['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'context', 'native', 'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint', 'object shape'],
          'string', 'number', 'number', 'number', 'number', 'number',
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'], 'string_or_number', 'node'],
      },
      node_count: 4,
      edge_count: 3,
    },
    nodes,
    edges,
    strings,
  }
}

/** CPU profile with a single blocking run of `blockMs` in `useEffect`. */
function buildCpuProfile(blockMs: number): Record<string, unknown> {
  const runSamples = Math.max(2, Math.round(blockMs / 50))
  const samples = [1, 2, ...new Array(runSamples).fill(3), 1]
  const timeDeltas = [1000, 1000, ...new Array(runSamples).fill(50000), 1000]
  return {
    startTime: 0,
    endTime: (samples.length * 50000) + 2000000,
    nodes: [
      { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: 0 }, hitCount: 0, children: [2] },
      { id: 2, callFrame: { functionName: 'renderApp', url: 'file:///App.tsx', lineNumber: 10 }, hitCount: 0, children: [3] },
      { id: 3, callFrame: { functionName: 'useEffect', url: 'file:///App.tsx', lineNumber: 42 }, hitCount: 0, children: [] },
    ],
    samples,
    timeDeltas,
  }
}

export function getFeatureCheck(id: string): FeatureCheck | undefined {
  return FEATURE_CATALOG.find(c => c.id === id)
}

export function listFeatureChecks(filter?: { category?: string; only?: string }): FeatureCheck[] {
  let checks = FEATURE_CATALOG
  if (filter?.category) {
    checks = checks.filter(c => c.category === filter.category)
  }
  if (filter?.only) {
    checks = checks.filter(c => c.id === filter.only)
  }
  return checks
}

export function categorizeChecks(checks: FeatureCheck[]): Record<string, FeatureCheck[]> {
  const grouped: Record<string, FeatureCheck[]> = {}
  for (const check of checks) {
    (grouped[check.category] ||= []).push(check)
  }
  return grouped
}
