import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadScenarios, defaultScenariosDir } from '../bench/loader'
import { loadReferences, defaultReferencesDir } from '../bench/references'
import { reportError } from '../utils/safe'

/**
 * Fine-tuned RN code model — dataset curation (Phase VII).
 *
 * Builds a fine-tuning dataset from the benchmark's human reference solutions:
 * every scenario's prompt + project context (fixtures) is paired with its
 * gold reference implementation, rendered in the ChatML format the Qwen /
 * DeepSeek-Coder SFT toolchains consume (unsloth, axolotl, LLaMA-Factory,
 * transformers). The benchmark suite is the eval harness — `vectalon bench`
 * scores any fine-tuned model against the same scenarios.
 */

export interface TrainingExample {
  id: string
  suite: string
  title: string
  /** ChatML messages: system (RN expert) → user (prompt + project context) → assistant (reference files). */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  /** Files the assistant should produce (the gold answer). */
  files: string[]
  /** Estimated tokens (chars / 4, the common English+code heuristic). */
  estimatedTokens: number
}

export interface DatasetBuildOptions {
  scenariosDir?: string
  referencesDir?: string
}

export interface DatasetStats {
  examples: number
  totalFiles: number
  totalChars: number
  estimatedTokens: number
}

export interface DatasetBuildResult {
  examples: TrainingExample[]
  stats: DatasetStats
  /** scenario ids with a reference but a validation problem. */
  problems: string[]
  /** scenarios skipped because no reference solution exists. */
  skippedNoReference: string[]
}

const SYSTEM_PROMPT = [
  'You are an expert React Native engineer. You write idiomatic TypeScript/TSX that follows the project conventions:',
  '- StyleSheet.create for styles, no inline style objects',
  '- React Navigation for navigation, typed params',
  '- KeyboardAvoidingView for iOS keyboard overlap, SafeAreaView for insets',
  '- accessibilityLabel / accessibilityRole on interactive elements',
  '- No hardcoded URLs or secrets — import from the config module',
  '- Dependency removal: clean up package.json, lockfiles, imports, and native config (Podfile / build.gradle)',
].join('\n')

/**
 * Curate the fine-tuning dataset. Each benchmark scenario with a reference
 * solution becomes one ChatML example: the user turn carries the scenario
 * prompt plus the fixture project context; the assistant turn is the reference
 * implementation.
 */
export function buildFineTuningDataset(options: DatasetBuildOptions = {}): DatasetBuildResult {
  const scenariosDir = options.scenariosDir || defaultScenariosDir()
  const referencesDir = options.referencesDir || defaultReferencesDir()

  const { scenarios, problems: scenarioProblems } = loadScenarios(scenariosDir)
  const { references, problems: referenceProblems } = loadReferences(referencesDir)

  const problems = [
    ...scenarioProblems.map(p => `${p.file}: ${p.problems.join('; ')}`),
    ...referenceProblems.map(p => `${p.file}: ${p.problems.join('; ')}`),
  ]

  const examples: TrainingExample[] = []
  const skippedNoReference: string[] = []

  for (const scenario of scenarios) {
    const ref = references.get(scenario.id)
    if (!ref) {
      skippedNoReference.push(scenario.id)
      continue
    }

    // Project context from the fixture files — the model learns to respect
    // existing config (deps, TS strictness, base URLs).
    const contextLines: string[] = []
    for (const [path, content] of Object.entries(scenario.fixtures)) {
      contextLines.push(`### ${path}\n\`\`\`\n${content}\n\`\`\``)
    }
    const context = contextLines.length > 0 ? `\n\nProject files:\n${contextLines.join('\n')}` : ''

    const expectedFiles = scenario.expect.files.join(', ')
    const user = [
      scenario.prompt,
      context,
      '',
      `Produce the following files (relative paths): ${expectedFiles}.`,
      'Follow the project conventions from the context and the system instructions.',
    ].join('\n')

    // Gold answer: the reference implementation files.
    const assistant = ref
      .map(f => `### ${f.path}\n\`\`\`tsx\n${f.content}\n\`\`\``)
      .join('\n\n')

    const estimatedTokens = Math.ceil((user.length + assistant.length) / 4)

    examples.push({
      id: scenario.id,
      suite: scenario.suite,
      title: scenario.title,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
        { role: 'assistant', content: assistant },
      ],
      files: ref.map(f => f.path),
      estimatedTokens,
    })
  }

  const stats: DatasetStats = {
    examples: examples.length,
    totalFiles: examples.reduce((sum, e) => sum + e.files.length, 0),
    totalChars: examples.reduce((sum, e) => sum + e.messages.reduce((s, m) => s + m.content.length, 0), 0),
    estimatedTokens: examples.reduce((sum, e) => sum + e.estimatedTokens, 0),
  }

  return { examples, stats, problems, skippedNoReference }
}

/** Render an example as a single JSONL line (unsloth / axolotl / LLaMA-Factory compatible). */
export function exampleToJsonl(example: TrainingExample): string {
  return JSON.stringify({ messages: example.messages })
}

/**
 * Write the dataset as JSONL (one ChatML conversation per line) plus a
 * manifest with the stats. Returns the JSONL path.
 */
export function writeDatasetJsonl(examples: TrainingExample[], stats: DatasetStats, outDir: string): string {
  const dir = resolve(outDir)
  try {
    mkdirSync(dir, { recursive: true })
    const jsonlPath = join(dir, 'rn-finetune-dataset.jsonl')
    writeFileSync(jsonlPath, examples.map(exampleToJsonl).join('\n') + '\n', 'utf-8')

    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify(
        {
          format: 'chatml-jsonl',
          createdAt: new Date().toISOString(),
          stats,
          examples: examples.map(e => ({ id: e.id, suite: e.suite, title: e.title, files: e.files, estimatedTokens: e.estimatedTokens })),
        },
        null,
        2
      ),
      'utf-8'
    )
    return jsonlPath
  } catch (err) {
    reportError(err, 'dataset: writing dataset files')
    throw err
  }
}

/** Render a dataset summary for CLI output. */
export function renderDatasetSummary(result: DatasetBuildResult, jsonlPath?: string): string {
  const lines: string[] = []
  lines.push('## 🧠 RN fine-tuning dataset')
  lines.push('')
  lines.push(`- Examples: **${result.stats.examples}** (one per benchmark scenario with a reference)`)
  lines.push(`- Gold files: **${result.stats.totalFiles}**`)
  lines.push(`- Size: ${(result.stats.totalChars / 1024).toFixed(1)} KB (~${result.stats.estimatedTokens.toLocaleString()} tokens)`)
  if (jsonlPath) lines.push(`- JSONL: \`${jsonlPath}\``)
  if (result.skippedNoReference.length > 0) {
    lines.push(`- Skipped (no reference): ${result.skippedNoReference.join(', ')}`)
  }
  if (result.problems.length > 0) {
    lines.push('')
    lines.push('Problems:')
    for (const p of result.problems) lines.push(`  - ${p}`)
  }
  return lines.join('\n')
}
