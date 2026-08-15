/**
 * vectalon review — PR Review Agent (Roadmap Phase 8, item 061)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reviews the diff (default: uncommitted changes; `--base <ref>` reviews a
 * branch vs its base) with the deterministic analyzer, the team-brain coding
 * standards (043), and an optional LLM pass. Reports to
 * docs/vectalon/review/ (gitignored) with --json output.
 */

import { resolve } from 'path'
import pc from 'picocolors'
import { printCarbonReport, parchment, dim } from '../carbon'
import { runReview, writeReviewReport, reviewDocsDir } from '../../review'
import { ModelRouter } from '../../model/ModelRouter'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import type { ModelProviderType } from '../../model/types'

export interface ReviewCommandOptions {
  /** Git ref the diff is taken against (default: uncommitted changes). */
  base?: string
  /** Print machine-readable output. */
  json?: boolean
  /** Model provider override for the LLM pass. */
  model?: string
}

export async function reviewCommand(directory: string, options: ReviewCommandOptions): Promise<void> {
  const root = resolve(directory || process.cwd())

  // Optional LLM pass: the model comes from --model else the project manifest.
  // LLM failures degrade to the deterministic pass, so this never blocks.
  const modelRouter = new ModelRouter({ projectRoot: root, zeroConfigEnabled: options.model ? false : undefined })
  try {
    const provider = resolveProjectModelProvider(root, options.model) as ModelProviderType
    const modelConfig = resolveProjectModelConfig(root)
    modelRouter.initialize({ provider, modelName: modelConfig?.modelName, apiKeyEnv: modelConfig?.apiKeyEnv })
  } catch {
    // No model configured — rule-only review is still a complete review.
  }

  const result = await runReview(root, { base: options.base, modelRouter })
  const { jsonPath } = writeReviewReport(root, result)

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  const body: string[] = []
  body.push(`base: ${result.base}`)
  body.push(`Files: ${result.summary.files} | Added lines: ${result.summary.addedLines}`)
  body.push(`Findings: ${result.summary.findings} (${result.summary.errors} error(s), ${result.summary.warnings} warning(s), ${result.summary.infos} info)`)
  body.push('')

  if (result.files.length === 0) {
    body.push('No changes to review — the diff is empty.')
  }
  for (const file of result.files) {
    const all = [...file.findings, ...file.standardFindings]
    body.push(pc.bold(file.path) + dim(`  (${file.addedLines} added line(s))`))
    for (const f of all) {
      const icon = f.severity === 'error' ? pc.red('✖') : f.severity === 'warning' ? pc.yellow('▲') : dim('•')
      body.push(`  ${icon} [${f.severity}] ${f.rule} (line ${f.line})`)
      body.push(`    ${parchment(f.message)}`)
    }
    if (file.llm) {
      body.push(`  ${dim('LLM:')} ${file.llm.verdict} — ${file.llm.summary}`)
    }
    if (all.length === 0 && !file.llm) {
      body.push(dim('  No findings.'))
    }
    body.push('')
  }

  if (result.files.length > 0) {
    body.push(dim(`Markdown: ${reviewDocsDir(root)}/review.md`))
  }

  printCarbonReport({
    title: 'vectalon review — PR Review Agent (061)',
    verdict: result.verdict,
    lines: body,
    reportPath: jsonPath,
    root,
    done: 'Review complete — address the findings before merging.',
  })
}
