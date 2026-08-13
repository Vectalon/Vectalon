import type { WorkflowPhase, WorkflowArtifact } from '../../adapters/types'
import { analyzeCrossPackageImpact, renderImpactReport, writeImpactDoc } from '../../harness/impact'
import { runCommand } from '../../adapters/runCommand'
import { phaseResult } from './helpers'
import { getIntent, isAddFeature, isRemoveDependency, isRefactor, isFix } from './intent'
import { reportError } from '../../utils/safe'

/**
 * Changed files in the working tree (tracked + untracked, staged + unstaged),
 * best-effort — returns [] when the directory is not a git repo. Impact runs
 * before implementation in the SDLC order, so the tree's current diff (plus
 * any explicit `ctx.inputs.changedFiles`) is the best signal of what will be
 * touched by this feature.
 */
async function changedFilesInTree(root: string): Promise<string[]> {
  try {
    const result = await runCommand('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })
    if (!result.success) return []
    return result.stdout
      .split('\n')
      .map(line => line.replace(/^\S+\s+/, '').trim())
      .filter(Boolean)
      .sort()
  } catch (err) {
    reportError(err, 'impactPhase: reading git status', 'warn')
    return []
  }
}

/**
 * Impact-analysis stage — deterministic cross-package blast radius.
 *
 * Runs `analyzeCrossPackageImpact` over the working-tree diff (or explicit
 * changed files) and persists a feature-named doc into the same tracked home
 * as the standalone `vectalon impact` command, so the blast-radius analysis
 * survives clones and shows up in PRs. No model calls — the graph comes from
 * the same AST analysis as the knowledge graph.
 */
export const impactPhase: WorkflowPhase = {
  id: 'impact',
  name: 'Impact analysis',
  description: 'Compute cross-package blast radius: affected packages, screens, navigators, and E2E flows.',
  run: async (ctx) => {
    const intent = (await getIntent(ctx)).intent

    // Explicit changed files win; otherwise the working-tree diff. Intent names
    // (feature / target / dependency) resolve to defining files inside the
    // harness, so a screen name typed in a prompt still lands in the report.
    const explicit = (ctx.inputs.changedFiles as string[] | undefined) || []
    const tree = await changedFilesInTree(ctx.projectRoot)
    const changed = [...new Set([...explicit, ...tree])].filter(Boolean)
    if (changed.length === 0) {
      if (isAddFeature(intent)) changed.push(intent.feature)
      else if (isRemoveDependency(intent)) changed.push(intent.dependency)
      else if (isRefactor(intent)) changed.push(intent.target)
      else if (isFix(intent)) changed.push(intent.area)
    }

    const impact = analyzeCrossPackageImpact(ctx.projectRoot, changed)
    const report = renderImpactReport(impact)

    // Persist the feature-named doc (slug from the first changed file) into the
    // tracked impact home — same convention as `vectalon impact --out`.
    let docPath: string | undefined
    try {
      docPath = writeImpactDoc(ctx.projectRoot, impact, report)
    } catch (err) {
      reportError(err, 'impactPhase: writing impact doc', 'warn')
    }

    const artifacts: WorkflowArtifact[] = [{ type: 'research', title: `Impact: ${ctx.prompt}`, content: report }]
    if (docPath) {
      artifacts.push({
        type: 'document',
        title: `Impact analysis: ${ctx.prompt}`,
        content: report,
        path: docPath,
      })
    }

    return phaseResult(
      'impact',
      'Impact analysis',
      'Compute cross-package blast radius: affected packages, screens, navigators, and E2E flows.',
      report,
      artifacts
    )
  },
}
