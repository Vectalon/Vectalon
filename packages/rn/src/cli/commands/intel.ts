/**
 * vectalon intel — Project Intelligence Core (Roadmap 001-010): manifest,
 * workspace, dependency graph, AST stats, incremental index, component +
 * navigation graphs, native module registry, and sub-second knowledge
 * retrieval in one deterministic pass.
 * Business Source License 1.1 (BSL-1.1)
 */
import { resolve } from 'path'
import pc from 'picocolors'
import { logger } from '../logger'
import { runProjectIntel, renderIntelMarkdown } from '../../intel'
import { buildDependencyGraph } from '../../intel/dependencyGraph'
import { buildApplicationModel, renderApplicationModel } from '../../intel/model'
import { buildKnowledgeGraph } from '../../harness'
import { detectUrlScheme } from '../../utils/deepLink'
import { buildNativeRegistry } from '../../intel/nativeRegistry'
import { buildProjectManifest, validateProjectManifest } from '../../projectManifest'

export interface IntelOptions {
  json?: boolean
  graph?: string
  search?: string
  bench?: boolean
  model?: boolean
}

const GRAPHS: Record<string, string> = {
  deps: 'dependency graph (internal edges, cycles, external packages)',
  components: 'component relationship graph (parent → child, re-render impact)',
  navigation: 'navigation graph (navigators, expo routes, deep-link map)',
  native: 'native module registry (pods, podspecs, gradle, TurboModule specs)',
  manifest: 'project manifest (versioned schema)',
}

export async function intelCommand(directory: string, options: IntelOptions): Promise<void> {
  const root = resolve(directory || process.cwd())
  logger.info(pc.bold(`vectalon intel — Project Intelligence Core`))
  logger.info(`project: ${root}`)
  logger.info('')

  if (options.graph) {
    const name = options.graph.toLowerCase()
    if (!(name in GRAPHS)) {
      logger.error(`Unknown graph "${name}". Valid: ${Object.keys(GRAPHS).join(', ')}`)
      process.exit(1)
    }
    let payload: unknown
    if (name === 'deps') payload = buildDependencyGraph(root)
    else if (name === 'components') payload = buildKnowledgeGraph(root)
    else if (name === 'navigation') {
      const graph = buildKnowledgeGraph(root)
      payload = { navigators: graph.navigators, expoRoutes: graph.expoRoutes, urlScheme: detectUrlScheme(root) }
    } else if (name === 'native') payload = buildNativeRegistry(root)
    else payload = { ...buildProjectManifest(root), issues: validateProjectManifest(buildProjectManifest(root)) }
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
    return
  }

  const { report, reportPath } = runProjectIntel(root, { search: options.search, bench: options.bench })

  if (options.model) {
    process.stdout.write(renderApplicationModel(buildApplicationModel(report)) + '\n')
    logger.info('')
    logger.dim('The application digest — the shared model every agent consumes (fix, review, upgrade, …).')
    return
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  process.stdout.write(renderIntelMarkdown(report) + '\n')
  logger.info('')
  logger.success(`report.json + report.md written to ${pc.dim(reportPath.slice(0, reportPath.lastIndexOf('/')))}`)
}
