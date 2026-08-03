import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join, isAbsolute, dirname } from 'path'
import type { WorkflowPhase, WorkflowArtifact, HealDecision } from '../../adapters/types'
import { phaseResult, failedPhase, detectConventions } from './helpers'
import { CodeReviewAnalyzer, ReviewFinding, RULES } from '../../sdlc/CodeReviewAnalyzer'
import {
  reviewCodeWithLLM,
  fixCodeWithLLM,
  type LLMCodeReview,
  type LLMReviewFinding,
} from '../../sdlc/LLMCodeReviewer'
import { getGeneratedOutputRoot, writeProjectFile, isSafeProjectPath } from './fileOutput'
import { reportPathChange } from '../../utils/fileDiff'
import { PolicyEngine, defaultCodeReviewPolicy } from '../../guardrails/PolicyEngine'
import { loadFailedHeals, recordFailedHeals, formatFailedHeals, type FailedHealRecord } from './healMemory'

/** Default review→fix→re-review cycles before the phase gives up (policy overrides). */
export const MAX_REVIEW_ATTEMPTS = defaultCodeReviewPolicy.maxAttempts

const SEVERITY_RANK: Record<string, number> = { error: 3, warning: 2, info: 1 }

/**
 * Build a human-readable rules list for the LLM reviewer and the report.
 * If the client repo has ESLint / Biome / Prettier / tsconfig configs,
 * surface those; otherwise fall back to the built-in comprehensive rule set.
 */
function buildRulesList(
  conventions: ReturnType<typeof detectConventions>
): string[] {
  const lintConfig = conventions.lintConfig
  const rules: string[] = []

  if (lintConfig?.eslint) {
    rules.push('❌ ESLint config detected — follow project ESLint rules')
    const lines = lintConfig.eslint.split('\n').slice(0, 30)
    rules.push(...lines.map(l => `   ${l.trim()}`).filter(l => l.length > 3))
  }
  if (lintConfig?.biome) {
    rules.push('❌ Biome config detected — follow project Biome rules')
    const lines = lintConfig.biome.split('\n').slice(0, 30)
    rules.push(...lines.map(l => `   ${l.trim()}`).filter(l => l.length > 3))
  }
  if (lintConfig?.prettier) {
    rules.push('❌ Prettier config detected — follow project formatting rules')
  }
  if (lintConfig?.tsconfig) {
    const strict = lintConfig.tsconfig.includes('"strict": true')
    rules.push(`❌ TypeScript strict mode: ${strict ? 'enabled' : 'disabled or not found'} — ${strict ? 'enforce strict typing' : 'recommend enabling strict mode'}`)
  }

  // Always include the built-in comprehensive rule set as a baseline.
  for (const rule of RULES) {
    const emoji = rule.severity === 'error' ? '🔴' : rule.severity === 'warning' ? '🟡' : '🔵'
    rules.push(`${emoji} \`${rule.id}\` — ${rule.severity}s: ${rule.message}`)
  }

  return rules
}

function severityAtLeast(severity: string, thresholdRank: number): boolean {
  return (SEVERITY_RANK[severity] ?? 0) >= thresholdRank
}

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

function countSeverityAtLeast(reviewed: FileReview[], thresholdRank: number): number {
  let total = 0
  for (const file of reviewed) {
    for (const f of file.ruleFindings) if (severityAtLeast(f.severity, thresholdRank)) total++
    for (const f of file.llmReview?.findings ?? []) if (severityAtLeast(f.severity, thresholdRank)) total++
  }
  return total
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

/** Tolerant parser for eslint (`file:line:col - msg (rule)`) and tsc (`file(line,col): error ...`). */
function parseToolErrors(output: string): Array<{ file: string; line: number; message: string }> {
  const results: Array<{ file: string; line: number; message: string }> = []
  const eslint = /(?:^|\n)\s*(?:\.\/)?([^\s:]+\.(?:tsx?|jsx?|ts|js)):(\d+)(?::\d+)?\s*(?:-|:)\s*(.+?)(?:\s*\(([a-z0-9@/-]+)\))?\s*$/gm
  const tsc = /(?:^|\n)\s*(?:\.\/)?([^\s(]+\.(?:tsx?|ts|js))\((\d+)(?:,\d+)?\):\s*error\s+(.+)$/gm

  let match: RegExpExecArray | null
  eslint.lastIndex = 0
  while ((match = eslint.exec(output)) !== null) {
    results.push({ file: match[1], line: Math.max(1, parseInt(match[2], 10) || 1), message: match[3].trim() })
  }
  tsc.lastIndex = 0
  while ((match = tsc.exec(output)) !== null) {
    results.push({ file: match[1], line: Math.max(1, parseInt(match[2], 10) || 1), message: match[3].trim() })
  }
  return results
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

    // Resolve self-healing tuning: CLI overrides > policy.json > defaults.
    const inputs = (ctx.inputs || {}) as { maxAttempts?: number; healSeverity?: string }
    const policy = projectRoot ? new PolicyEngine(projectRoot).getCodeReviewPolicy() : defaultCodeReviewPolicy
    const maxAttempts =
      typeof inputs.maxAttempts === 'number' && inputs.maxAttempts >= 1
        ? Math.floor(inputs.maxAttempts)
        : policy.maxAttempts
    const healSeverity: 'error' | 'warning' | 'info' =
      inputs.healSeverity === 'warning' || inputs.healSeverity === 'info' ? inputs.healSeverity : policy.healSeverity
    const doToolChecks = policy.toolChecks
    const thresholdRank = SEVERITY_RANK[healSeverity] ?? 3

    const conventions = detectConventions(ctx.snapshot)
    const components = ctx.snapshot?.components?.map(c => c.name).join(', ') || 'none'
    // Inject known recurring issues from previous failed heals so the model can
    // avoid repeating the same mistakes on this run.
    const priorHeals = projectRoot ? loadFailedHeals(projectRoot) : []
    // Inject only the most recent failures so the prompt stays token-bounded.
    const priorContext =
      priorHeals.length > 0
        ? [
            'Known issues from previous failed heals (do not repeat these mistakes):',
            formatFailedHeals(priorHeals.slice(0, 10)),
          ]
        : []
    const projectContext = [
      `Feature: ${ctx.prompt}`,
      `TypeScript: ${conventions.hasTypeScript ? 'yes' : 'no'}`,
      `React Navigation: ${conventions.hasNavigation ? 'yes' : 'no'}`,
      `StyleSheet usage: ${conventions.usesStyleSheet ? 'yes' : 'no'}`,
      `Existing components: ${components}`,
      ...priorContext,
    ].join('\n')

    const reviewRules = buildRulesList(conventions)
    const modelAvailable = Boolean(ctx.modelRouter && typeof ctx.modelRouter.generate === 'function')

    // Self-healing loop: review, feed error findings back to the model, write
    // the corrected files, then re-review. Caps at maxAttempts cycles.
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
            rules: reviewRules,
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

    async function fixWithReview(file: FileReview, findings: LLMReviewFinding[], content: string): Promise<string | null> {
      // Ask the model for the corrected file; if the user (or caller) wants a
      // retry, re-ask up to 2 more times. Returns the accepted content or null.
      let current = content
      for (let attempt = 0; attempt < 3; attempt++) {
        const fixedContent = await fixCodeWithLLM(ctx.modelRouter, {
          code: current,
          fileName: file.file,
          findings,
          context: projectContext,
        })
        // Never let a degraded model echo the review JSON (or any review-shaped
        // payload) back over the real implementation file, and reject prose or
        // stray chat that doesn't look like code at all.
        if (!fixedContent || fixedContent === current) return null
        if (fixedContent.includes('"verdict"') && fixedContent.includes('"findings"')) return null
        const looksLikeCode =
          /[{};=]/.test(fixedContent) ||
          /\b(const|let|var|function|import|export|class|interface|type|return)\b/.test(fixedContent) ||
          fixedContent.includes('\n')
        if (!looksLikeCode) return null

        if (!ctx.onHealFix) {
          return fixedContent
        }
        const decision: HealDecision = await ctx.onHealFix({
          file: file.file,
          currentContent: current,
          fixedContent,
          findings,
        })
        if (decision === 'accept') return fixedContent
        if (decision === 'reject') {
          healLog.push(`- \`${file.file}\`: fix rejected by user`)
          return null
        }
        // retry: feed the model's own attempt back as the new baseline
        current = fixedContent
      }
      return null
    }

    async function healErrors(reviewed: FileReview[], threshold: number): Promise<number> {
      let fixed = 0
      for (const file of reviewed) {
        const errorFindings: LLMReviewFinding[] = [
          ...file.ruleFindings.filter(f => severityAtLeast(f.severity, threshold)),
          ...(file.llmReview?.findings.filter(f => severityAtLeast(f.severity, threshold)) ?? []),
        ]
        if (errorFindings.length === 0) continue

        // Prefer inline artifact content (same precedence as reviewAll) so the
        // fix always targets the version the review just saw; fall back to disk.
        const content = file.artifact.content?.trim()
          ? file.artifact.content
          : readFileSafe(resolveArtifactPath(projectRoot, file.file) || '')
        if (!content) continue

        const fixedContent = await fixWithReview(file, errorFindings, content)
        if (!fixedContent) continue

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
          healLog.push(`- \`${file.file}\`: fixed ${errorFindings.length} finding(s)`)
        }
      }
      return fixed
    }

    // Map a tool-reported file path to a generated artifact (by suffix/basename).
    function matchArtifact(reportedFile: string): WorkflowArtifact | null {
      const all = [...(implPhase.artifacts || []), ...(testPhase?.artifacts || [])]
      const normalized = reportedFile.replace(/\\/g, '/')
      const base = normalized.split('/').pop() || normalized
      return (
        all.find(
          a => a.path && (normalized.endsWith(a.path) || a.path.endsWith(base) || a.path.includes(base))
        ) || null
      )
    }

    async function runToolChecks(): Promise<{ errors: number; failedChecks: number; reviewed: FileReview[] }> {
      const testRunner = ctx.adapters?.testRunner
      if (!testRunner) return { errors: 0, failedChecks: 0, reviewed: [] }

      const checks: Array<{ name: string; promise: Promise<{ success: boolean; stdout: string; stderr: string }> }> = []
      if (typeof testRunner.runLint === 'function') checks.push({ name: 'lint', promise: testRunner.runLint() })
      if (typeof testRunner.runTypeCheck === 'function') checks.push({ name: 'typecheck', promise: testRunner.runTypeCheck() })

      const findingsByFile = new Map<string, LLMReviewFinding[]>()
      let errors = 0
      let failedChecks = 0
      for (const check of checks) {
        try {
          const result = await check.promise
          if (result.success) continue
          // A check that exits non-zero is a failed check even when none of its
          // errors map to generated files (e.g. pre-existing lint debt).
          failedChecks++
          for (const parsed of parseToolErrors(`${result.stdout}\n${result.stderr}`)) {
            const artifact = matchArtifact(parsed.file)
            if (!artifact) continue
            const finding: LLMReviewFinding = {
              severity: 'error',
              rule: `tool:${check.name}`,
              message: parsed.message,
              line: parsed.line,
            }
            const list = findingsByFile.get(artifact.path || '') || []
            list.push(finding)
            findingsByFile.set(artifact.path || '', list)
            errors++
          }
        } catch {
          // A missing command (e.g. no lint script) must not fail the phase.
        }
      }

      const reviewed: FileReview[] = []
      for (const [path, findings] of findingsByFile) {
        const artifact = (implPhase.artifacts || []).find(a => a.path === path) ||
          (testPhase?.artifacts || []).find(a => a.path === path)
        if (!artifact) continue
        reviewed.push({
          file: path,
          artifact,
          ruleFindings: [],
          llmReview: { verdict: 'changes-requested', summary: `Tool check found ${findings.length} error(s)`, findings, source: 'llm' },
        })
      }
      return { errors, failedChecks, reviewed }
    }

    // Merge tool-check findings into existing file reviews (by path) so the
    // report shows one section per file instead of duplicates. Findings already
    // present (same rule+line+message) are skipped, so re-merging across loop
    // attempts never duplicates entries.
    function mergeToolFindings(base: FileReview[], tool: FileReview[]): FileReview[] {
      const merged = [...base]
      for (const entry of tool) {
        const existing = merged.find(m => m.file === entry.file)
        const toolFindings = entry.llmReview?.findings ?? []
        if (!existing) {
          merged.push(entry)
          continue
        }
        if (toolFindings.length === 0) continue
        const current = existing.llmReview
        const seen = new Set((current?.findings ?? []).map(f => `${f.rule}:${f.line}:${f.message}`))
        const fresh = toolFindings.filter(f => !seen.has(`${f.rule}:${f.line}:${f.message}`))
        if (fresh.length === 0) continue
        existing.llmReview = {
          verdict: 'changes-requested',
          summary: current?.summary ? `${current.summary}; ${entry.llmReview?.summary ?? 'tool check'}` : (entry.llmReview?.summary ?? 'tool check'),
          findings: [...(current?.findings ?? []), ...fresh],
          source: 'llm',
        }
      }
      return merged
    }

    let totalErrors = 0
    let totalWarnings = 0
    let totalInfos = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const review = await reviewAll()
      allFindings = review.reviewed
      totalErrors = review.errors
      totalWarnings = review.warnings
      totalInfos = review.infos

      const healable = countSeverityAtLeast(review.reviewed, thresholdRank)
      if (healable === 0) break
      if (!modelAvailable) break
      if (attempt === maxAttempts - 1) break

      healLog.push(`- Attempt ${attempt + 1}: feeding ${healable} finding(s) back to the model`)
      const fixed = await healErrors(review.reviewed, thresholdRank)
      if (fixed === 0) {
        healLog.push('- No files could be auto-fixed; stopping the heal loop')
        break
      }
      healLog.push(`- ${fixed} file(s) corrected; re-reviewing`)
    }

    // Lint/typecheck gate: after the LLM review loop passes, run the project's
    // detected validation commands and feed their errors back through the same
    // heal loop before the PR phase. Errors in files the workflow did not
    // generate can't be healed here — they're reported and left to the
    // verification phase (which always gates on lint) rather than failing code
    // review on pre-existing lint debt.
    if (totalErrors === 0 && doToolChecks && modelAvailable) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const tool = await runToolChecks()
        if (tool.failedChecks === 0) break
        if (tool.reviewed.length === 0) {
          // Every reported error lives outside generated files: can't heal,
          // report and let verification gate on it.
          healLog.push(`- ${tool.failedChecks} lint/typecheck check(s) failed outside generated files; reported (verification will gate)`)
          break
        }
        // Merge tool-reviewed files into allFindings (deduped by path) so
        // restore-on-failed-heal resets their artifact content and failed
        // heals get recorded without duplicating report sections.
        allFindings = mergeToolFindings(allFindings, tool.reviewed)
        healLog.push(`- Tool check attempt ${attempt + 1}: ${tool.errors} lint/typecheck error(s)`)
        const fixed = await healErrors(tool.reviewed, 3)
        if (fixed === 0) {
          healLog.push('- Tool errors could not be auto-fixed')
          totalErrors += tool.errors
          break
        }
        healLog.push(`- ${fixed} file(s) corrected after tool check; re-running checks`)
      }
      // The loop exited clean: every tool finding still listed on a generated
      // file was healed. Mark them resolved so the report doesn't show a
      // passing phase with open 🚫 tool findings.
      if (totalErrors === 0) {
        for (const entry of allFindings) {
          const review = entry.llmReview
          if (!review || !review.findings.some(f => f.rule.startsWith('tool:'))) continue
          entry.llmReview = {
            ...review,
            verdict: 'approved',
            summary: review.summary ? `${review.summary} — fixed by heal loop` : 'Fixed by heal loop',
          }
        }
      }
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

    // Persist failed heals so future runs learn from these mistakes.
    if (totalErrors !== 0 && projectRoot) {
      const records: FailedHealRecord[] = allFindings.flatMap(f => {
        const errs: LLMReviewFinding[] = [
          ...f.ruleFindings.filter(x => x.severity === 'error'),
          ...(f.llmReview?.findings.filter(x => x.severity === 'error') ?? []),
        ]
        return errs.length > 0
          ? [{ timestamp: Date.now(), prompt: ctx.prompt, file: f.file, findings: errs }]
          : []
      })
      recordFailedHeals(projectRoot, records)
    }

    const llmReviewed = allFindings.some(f => f.llmReview !== null)

    const outputParts: string[] = [
      '# Code Review Report',
      '',
      `**Summary:** ${totalErrors} error(s), ${totalWarnings} warning(s), ${totalInfos} info note(s)`,
      `**Files reviewed:** ${(implPhase.artifacts || []).length + (testPhase?.artifacts || []).length}`,
      `**Heal policy:** ${maxAttempts} attempt(s), severity ≥ ${healSeverity}, tool checks ${doToolChecks ? 'on' : 'off'}`,
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
    outputParts.push(...reviewRules)
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
