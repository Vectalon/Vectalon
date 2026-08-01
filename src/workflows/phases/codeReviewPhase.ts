import { readFileSync } from 'fs'
import { join, isAbsolute } from 'path'
import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import { phaseResult, failedPhase } from './helpers'
import { CodeReviewAnalyzer, ReviewFinding } from '../../sdlc/CodeReviewAnalyzer'
import { getGeneratedOutputRoot } from './fileOutput'

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

    const allFindings: { file: string; findings: ReviewFinding[] }[] = []
    let totalErrors = 0
    let totalWarnings = 0
    let totalInfos = 0

    // Review implementation files. Prefer the artifact's inline content (always
    // present and immune to path redirection); fall back to a disk read only when
    // the artifact carries no content.
    const implArtifacts = implementationPhase.artifacts || []
    for (const artifact of implArtifacts) {
      if (!artifact.path || artifact.type === 'document') continue
      const content = typeof artifact.content === 'string' && artifact.content.trim()
        ? artifact.content
        : readFileSafe(resolveArtifactPath(projectRoot, artifact.path) || '')
      if (!content) continue

      const findings = analyzer.review(content)
      if (findings.length > 0) {
        allFindings.push({ file: artifact.path, findings })
        totalErrors += findings.filter(f => f.severity === 'error').length
        totalWarnings += findings.filter(f => f.severity === 'warning').length
        totalInfos += findings.filter(f => f.severity === 'info').length
      }
    }

    // Also review test files
    const testArtifacts = testPhase?.artifacts || []
    for (const artifact of testArtifacts) {
      if (!artifact.path || artifact.type === 'document') continue
      const content = typeof artifact.content === 'string' && artifact.content.trim()
        ? artifact.content
        : readFileSafe(resolveArtifactPath(projectRoot, artifact.path) || '')
      if (!content) continue

      const findings = analyzer.review(content)
      if (findings.length > 0) {
        allFindings.push({ file: artifact.path, findings })
        totalErrors += findings.filter(f => f.severity === 'error').length
        totalWarnings += findings.filter(f => f.severity === 'warning').length
        totalInfos += findings.filter(f => f.severity === 'info').length
      }
    }

    const outputParts: string[] = [
      '# Code Review Report',
      '',
      `**Summary:** ${totalErrors} error(s), ${totalWarnings} warning(s), ${totalInfos} info note(s)`,
      `**Files reviewed:** ${implArtifacts.length + testArtifacts.length}`,
      '',
    ]

    if (allFindings.length === 0) {
      outputParts.push('✅ All files passed code review. No issues found.')
    } else {
      outputParts.push('## Findings by file')
      outputParts.push('')

      for (const { file, findings } of allFindings) {
        outputParts.push(`### ${file}`)
        outputParts.push(...findings.map(formatFinding))
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
