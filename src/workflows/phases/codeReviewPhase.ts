import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join, isAbsolute, dirname } from 'path'
import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import { phaseResult, failedPhase, detectConventions } from './helpers'
import { CodeReviewAnalyzer, ReviewFinding } from '../../sdlc/CodeReviewAnalyzer'
import {
  reviewCodeWithLLM,
  fixCodeWithLLM,
  type LLMCodeReview,
  type LLMReviewFinding,
} from '../../sdlc/LLMCodeReviewer'
import { getGeneratedOutputRoot, writeProjectFile, isSafeProjectPath } from './fileOutput'
import { reportPathChange } from '../../utils/fileDiff'

/** Max review→fix→re-review cycles before the phase gives up. */
export const MAX_REVIEW_ATTEMPTS = 3

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

// Resolve an artifact to its on-disk location. Artifacts carry relative paths
// (e.g. src/services/LoginApi.ts) but generated files may be redirected to
// .vectalon/generated/ when the workflow runs inside the rn-vectalon package
// itself — so honor the same output-root logic the write path uses.
function resolveArtifactPath(projectRoot: string | undefined, artifactPath: string): string | null {
  if (!artifactPath) return null
  if (isAbsolute(artifactPath) || artifactPath.startsWith('.')) return artifactPath
  if (!projectRoot) return null
  const root = getGeneratedOutputRoot(projectRoot)
  return join(root, artifactPath)
}

function formatFinding(f: ReviewFinding): string {
  const emoji = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵'
  return `${emoji} **${f.rule}** (line ${f.line}): ${f.message}`
}

function formatLLMFinding(f: LLMReviewFinding): string {
  const emoji = f.severity === 'error' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵'
  const suggestion = f.suggestion ? ` — *suggestion:* ${f.suggestion}` : ''
  return `${emoji} **${f.rule}** (line ${f.line}): ${f.message}${suggestion}`
}

interface FileReview {
  file: string
  artifact: WorkflowArtifact
  ruleFindings: ReviewFinding[]
  llmReview: LLMCodeReview | null
}

function countSeverity(findings: Array<{ severity: string }>, severity: string): number {
  return findings.filter(f => f.severity === severity).length
}

// Persist a corrected file and surface the change through the diff-reporting
// sink (the CLI streams these as Claude-style modified diffs). Reuses the
// canonical writeProjectFile (which handles the output root, safe-path guard,
// and diff reporting) for relative paths; falls back to a manual write only
// for absolute/`.`-prefixed artifact paths that writeProjectFile rejects.
function writeFixedFile(projectRoot: string | undefined, filePath: string, content: string): string | null {
  if (projectRoot && isSafeProjectPath(filePath)) {
    return writeProjectFile(projectRoot, filePath, content)
  }
  const fullPath = resolveArtifactPath(projectRoot, filePath)
  if (!fullPath) return null
  const oldContent = readFileSafe(fullPath)
  try {
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  } catch {
    return null
  }
  reportPathChange(filePath, oldContent, content)
  return fullPath
}

export const codeReviewPhase: WorkflowPhase = {
  id: 'code-review',
  name: 'Code review',
  description: 'Review generated code for quality issues, anti-patterns, and React Native best practices before raising PR.',
  run: async (ctx) => {
    const analyzer = new CodeReviewAnalyzer()
    const projectRoot = ctx.projectRoot
    const implementationPhase = ctx.state.phases.find(p => p.id === 'implementation')
    const testPhase = ctx.state.phases.find(p => p.id === 'tests')

    if (!implementationPhase) {
      return failedPhase(
        'code-review',
        'Code review',
        'Review generated code for quality issues, anti-patterns, and React Native best practices before raising PR.',
        'No implementation phase found. Cannot review code that does not exist.'
      )
    }
    // Narrow the captured phase for closures (TS can't narrow the property chain).
    const implPhase = implementationPhase

    const conventions = detectConventions(ctx.snapshot)
    const components = ctx.snapshot?.components?.map(c => c.name).join(', ') || 'none'
    const projectContext = [
      `Feature: ${ctx.prompt}`,
      `TypeScript: ${conventions.hasTypeScript ? 'yes' : 'no'}`,
      `React Navigation: ${conventions.hasNavigation ? 'yes' : 'no'}`,
      `StyleSheet usage: ${conventions.usesStyleSheet ? 'yes' : 'no'}`,
      `Existing components: ${components}`,
    ].join('\n')

    const modelAvailable = Boolean(ctx.modelRouter && typeof ctx.modelRouter.generate === 'function')

    // Self-healing loop: review, feed error findings back to the model, write
    // the corrected files, then re-review. Caps at MAX_REVIEW_ATTEMPTS cycles.
    const healLog: string[] = []
    // Snapshot of pre-heal file contents (path -> original), so a failed heal
    // can restore the originals instead of leaving the model's last broken fix.
    const healedFiles = new Map<string, string>()
    let allFindings: FileReview[] = []

    async function reviewAll(): Promise<{ errors: number; warnings: number; infos: number; reviewed: FileReview[] }> {
      const reviewed: FileReview[] = []
      async function reviewArtifacts(artifacts: WorkflowArtifact[]): Promise<void> {
        for (const artifact of artifacts) {
          if (!artifact.path || artifact.type === 'document') continue
          const content = typeof artifact.content === 'string' && artifact.content.trim()
            ? artifact.content
            : readFileSafe(resolveArtifactPath(projectRoot, artifact.path) || '')
          if (!content) continue

          const ruleFindings = analyzer.review(content)
          const llmReview = await reviewCodeWithLLM(ctx.modelRouter, {
            code: content,
            fileName: artifact.path,
            context: projectContext,
          })
          if (ruleFindings.length > 0 || llmReview !== null) {
            reviewed.push({ file: artifact.path, artifact, ruleFindings, llmReview })
          }
        }
      }

      await reviewArtifacts(implPhase.artifacts || [])
      await reviewArtifacts(testPhase?.artifacts || [])

      const ruleFindings = reviewed.flatMap(f => f.ruleFindings)
      const llmFindings = reviewed.flatMap(f => f.llmReview?.findings ?? [])
      return {
        errors: countSeverity(ruleFindings, 'error') + countSeverity(llmFindings, 'error'),
        warnings: countSeverity(ruleFindings, 'warning') + countSeverity(llmFindings, 'warning'),
        infos: countSeverity(ruleFindings, 'info') + countSeverity(llmFindings, 'info'),
        reviewed,
      }
    }

    async function healErrors(reviewed: FileReview[]): Promise<number> {
      let fixed = 0
      for (const file of reviewed) {
        const errorFindings: LLMReviewFinding[] = [
          ...file.ruleFindings.filter(f => f.severity === 'error'),
          ...(file.llmReview?.findings.filter(f => f.severity === 'error') ?? []),
        ]
        if (errorFindings.length === 0) continue

        // Prefer inline artifact content (same precedence as reviewAll) so the
        // fix always targets the version the review just saw; fall back to disk.
        const content = file.artifact.content?.trim()
          ? file.artifact.content
          : readFileSafe(resolveArtifactPath(projectRoot, file.file) || '')
        if (!content) continue

        const fixedContent = await fixCodeWithLLM(ctx.modelRouter, {
          code: content,
          fileName: file.file,
          findings: errorFindings,
          context: projectContext,
        })
        // Never let a degraded model echo the review JSON (or any review-shaped
        // payload) back over the real implementation file, and reject prose or
        // stray chat that doesn't look like code at all.
        if (!fixedContent || fixedContent === content) continue
        if (fixedContent.includes('"verdict"') && fixedContent.includes('"findings"')) continue
        const looksLikeCode =
          /[{};=]/.test(fixedContent) ||
          /\b(const|let|var|function|import|export|class|interface|type|return)\b/.test(fixedContent) ||
          fixedContent.includes('\n')
        if (!looksLikeCode) continue

        const written = writeFixedFile(projectRoot, file.file, fixedContent)
        if (written) {
          // Remember the original so a failed heal can put it back.
          if (!healedFiles.has(file.file)) {
            healedFiles.set(file.file, content)
          }
          // Sync the artifact content (implementation OR test phase) so
          // re-review sees the fix even when artifacts carry inline content.
          file.artifact.content = fixedContent
          fixed++
          healLog.push(`- \`${file.file}\`: fixed ${errorFindings.length} error finding(s)`)
        }
      }
      return fixed
    }

    let totalErrors = 0
    let totalWarnings = 0
    let totalInfos = 0

    for (let attempt = 0; attempt < MAX_REVIEW_ATTEMPTS; attempt++) {
      const review = await reviewAll()
      allFindings = review.reviewed
      totalErrors = review.errors
      totalWarnings = review.warnings
      totalInfos = review.infos

      if (totalErrors === 0) break

      if (attempt === MAX_REVIEW_ATTEMPTS - 1 || !modelAvailable) break

      healLog.push(`- Attempt ${attempt + 1}: feeding ${totalErrors} error finding(s) back to the model`)
      const fixed = await healErrors(review.reviewed)
      if (fixed === 0) {
        healLog.push('- No files could be auto-fixed; stopping the heal loop')
        break
      }
      healLog.push(`- ${fixed} file(s) corrected; re-reviewing`)
    }

    // The loop exhausted its attempts: put the original files back so the repo
    // isn't left with the model's last (still-broken) fix on disk. The report
    // still documents the failed review; the working tree matches what the
    // implementation phase produced before healing started.
    if (totalErrors !== 0 && healedFiles.size > 0) {
      healLog.push('- Heal loop failed; restoring original file contents')
      for (const [filePath, original] of healedFiles) {
        const restored = writeFixedFile(projectRoot, filePath, original)
        if (restored) {
          const artifact = allFindings.find(f => f.file === filePath)?.artifact
          if (artifact) artifact.content = original
          healLog.push(`- \`${filePath}\`: restored original content`)
        }
      }
    }

    const llmReviewed = allFindings.some(f => f.llmReview !== null)

    const outputParts: string[] = [
      '# Code Review Report',
      '',
      `**Summary:** ${totalErrors} error(s), ${totalWarnings} warning(s), ${totalInfos} info note(s)`,
      `**Files reviewed:** ${(implPhase.artifacts || []).length + (testPhase?.artifacts || []).length}`,
      llmReviewed
        ? '**Reviewer:** LLM + rule-based analyzer'
        : '**Reviewer:** rule-based analyzer (LLM unavailable)',
      '',
    ]

    if (healLog.length > 0) {
      outputParts.push('## Self-healing')
      outputParts.push('')
      outputParts.push(...healLog)
      outputParts.push('')
    }

    if (allFindings.length === 0) {
      outputParts.push('✅ All files passed code review. No issues found.')
    } else {
      outputParts.push('## Findings by file')
      outputParts.push('')

      for (const { file, ruleFindings: rules, llmReview } of allFindings) {
        outputParts.push(`### ${file}`)
        if (llmReview) {
          outputParts.push('')
          outputParts.push(`**LLM review:** ${llmReview.verdict === 'approved' ? '✅ approved' : '🚫 changes requested'}${llmReview.summary ? ` — ${llmReview.summary}` : ''}`)
          if (llmReview.findings.length > 0) {
            outputParts.push(...llmReview.findings.map(formatLLMFinding))
          }
        }
        if (rules.length > 0) {
          if (llmReview) outputParts.push('')
          outputParts.push('**Rule-based findings:**')
          outputParts.push(...rules.map(formatFinding))
        }
        outputParts.push('')
      }
    }

    outputParts.push('')
    outputParts.push('## Rules checked')
    outputParts.push('- ❌ `console.log` / `console.debug` — warnings')
    outputParts.push('- ❌ `any` type usage — warnings')
    outputParts.push('- ❌ `@ts-ignore` — warnings')
    outputParts.push('- ❌ Empty catch blocks — errors')
    outputParts.push('- ❌ `TODO` / `FIXME` comments — info')
    outputParts.push('- ❌ Inline styles (`style={{...}}`) — info')
    outputParts.push('')

    if (totalErrors === 0) {
      outputParts.push('✅ Code review passed. Proceeding to verification and PR.')
    } else {
      outputParts.push('🔴 Code review failed due to errors. Fix the issues above before proceeding.')
    }

    const output = outputParts.join('\n')
    const artifacts: WorkflowArtifact[] = [
      {
        type: 'engineering',
        title: `Code review: ${ctx.prompt}`,
        content: output,
      },
    ]

    if (totalErrors === 0) {
      return phaseResult(
        'code-review',
        'Code review',
        'Review generated code for quality issues, anti-patterns, and React Native best practices before raising PR.',
        output,
        artifacts
      )
    }

    return failedPhase(
      'code-review',
      'Code review',
      'Review generated code for quality issues, anti-patterns, and React Native best practices before raising PR.',
      output
    )
  },
}
