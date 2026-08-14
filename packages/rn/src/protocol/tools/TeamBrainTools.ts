/**
 * Team Brain MCP tools (Roadmap Phase 6, items 041-049).
 * Business Source License 1.1 (BSL-1.1)
 *
 * Exposes the Team Brain over MCP so agents can generate and query it through
 * `vectalon serve` without shelling out to the CLI: `generate_team_brain`
 * runs one deterministic pass (glossary, coding standards, expertise map,
 * ADR/decision index, PR knowledge, onboarding brief) and `search_team_knowledge`
 * runs the Phase 6 acceptance query (team knowledge searchable via semantic
 * queries, across every registered project).
 *
 * Gating mirrors KnowledgeTools: generate needs the knowledge base (it seeds
 * artifacts) and search needs a team store (it queries across projects), so
 * the server advertises each only when the matching service is present.
 */
import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { ARTIFACT_TYPES } from '../../knowledge/artifactTypes'
import type { ArtifactType } from '../../knowledge/artifactTypes'
import { buildTeamBrain, searchTeamBrain, teamDocsDir } from '../../teamBrain'

/**
 * Team Brain tools. `generate_team_brain` writes knowledge-base artifacts and
 * project docs, so it is gated on the artifact store and excluded from safe
 * mode; `search_team_knowledge` is read-only and gated on the team store.
 */
export class TeamBrainTools extends ToolRegistry {
  @mcpTool('generate_team_brain', 'Generate the Team Brain for this project: glossary (044), coding standards (043), expertise map (046), ADR/decision index (042/048), PR knowledge (045), and onboarding brief (049). Seeded idempotently into the knowledge base with docs written to docs/vectalon/team/', {
    type: 'object',
    properties: {},
  }, 'artifactStore')
  async generateTeamBrain(): Promise<string> {
    const root = this.projectRoot()
    const result = await buildTeamBrain(root)
    return JSON.stringify(
      {
        projectName: result.projectName,
        root: result.root,
        scannedAt: result.scannedAt,
        glossaryTerms: result.glossary.length,
        codingStandards: result.standards.length,
        expertiseAuthors: result.expertise.length,
        decisionsIndexed: result.decisions.length,
        prs: result.prKnowledge.length,
        artifacts: result.artifacts,
        docsDir: teamDocsDir(result.root),
      },
      null,
      2
    )
  }

  @mcpTool('search_team_knowledge', 'Search the Team Brain across every registered project, ranked by relevance × provenance confidence; scoped by project, team, and artifact type', {
    type: 'object',
    properties: {
      query: { type: 'string' },
      project: { type: 'string' },
      team: { type: 'string' },
      type: { type: 'string', enum: ARTIFACT_TYPES },
      limit: { type: 'number' },
    },
    required: ['query'],
  }, 'teamStore')
  async searchTeamKnowledge(args: Record<string, unknown>): Promise<string> {
    const root = this.projectRoot()
    const query = (args.query as string) || ''
    if (!query) {
      return 'No query provided. Pass a query string to search the team brain.'
    }

    const type = args.type as string
    if (type && !ARTIFACT_TYPES.includes(type as never)) {
      throw new Error(`Unknown artifact type: ${type}. Valid types: ${ARTIFACT_TYPES.join(', ')}`)
    }

    const hits = await searchTeamBrain(root, query, {
      project: args.project as string | undefined,
      team: args.team as string | undefined,
      type: (type as ArtifactType) || undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    })

    if (hits.length === 0) {
      return 'No team knowledge matched the query across the registered projects.'
    }

    return JSON.stringify(hits, null, 2)
  }

  /** Serve root: the engine snapshot's project root (cwd fallback). */
  private projectRoot(): string {
    return this.ctx.engine.getSnapshot()?.project.root || process.cwd()
  }
}
