import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { RoleEngine } from '../../knowledge/RoleEngine'
import { ARTIFACT_ROLES, ARTIFACT_TYPES } from '../../knowledge/artifactTypes'
import type { ArtifactRole, ArtifactType } from '../../knowledge/artifactTypes'
import type { ArtifactStore } from '../../knowledge/ArtifactStore'
import type { TeamStore } from '../../knowledge/TeamStore'
import { TelemetryIngestionService } from '../../knowledge/telemetry'
import { isTelemetryFormat } from '../../knowledge/telemetry/formats'
import type { TelemetryFormat } from '../../knowledge/telemetry'
import { RootCauseAnalyzer } from '../../sdlc/RootCauseAnalyzer'

/**
 * Knowledge-base tools. All are gated: artifact tools require an artifact store
 * and team tools require a team store — the server registers/advertises them
 * only when the matching service is present on the context.
 */
export class KnowledgeTools extends ToolRegistry {
  @mcpTool('list_artifacts', 'List artifacts in the knowledge base', {
    type: 'object',
    properties: {},
  }, 'artifactStore')
  async listArtifacts(): Promise<string> {
    const store = this.store()
    const summary = store.list().map(a => ({
      id: a.id,
      type: a.type,
      title: a.title,
      status: a.status,
      version: a.version,
      updatedAt: a.updatedAt,
    }))
    return JSON.stringify(summary, null, 2)
  }

  @mcpTool('get_artifact', 'Get a single artifact from the knowledge base by id', {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  }, 'artifactStore')
  async getArtifact(args: Record<string, unknown>): Promise<string> {
    const store = this.store()
    const artifact = store.get(args.id as string)
    if (!artifact) throw new Error(`Artifact not found: ${args.id}`)
    return JSON.stringify(artifact, null, 2)
  }

  @mcpTool('get_knowledge_context', 'Get knowledge base context scoped to a role', {
    type: 'object',
    properties: { role: { type: 'string', enum: ARTIFACT_ROLES } },
    required: ['role'],
  }, 'artifactStore')
  async getKnowledgeContext(args: Record<string, unknown>): Promise<string> {
    const store = this.store()
    const role = args.role as string
    if (!ARTIFACT_ROLES.includes(role as never)) {
      throw new Error(`Unknown role: ${role}. Valid roles: ${ARTIFACT_ROLES.join(', ')}`)
    }
    return new RoleEngine().buildContext(role as never, store.list())
  }

  @mcpTool('link_artifacts', 'Link a parent artifact to a child artifact', {
    type: 'object',
    properties: {
      parentId: { type: 'string' },
      childId: { type: 'string' },
    },
    required: ['parentId', 'childId'],
  }, 'artifactStore')
  async linkArtifacts(args: Record<string, unknown>): Promise<string> {
    const store = this.store()
    const parentId = args.parentId as string
    const childId = args.childId as string
    if (!store.link(parentId, childId)) {
      throw new Error(`Failed to link artifacts: missing id`)
    }
    return `Linked ${parentId} -> ${childId}`
  }

  @mcpTool('ingest_telemetry', 'Ingest runtime telemetry exports (Sentry / Firebase Crashlytics / performance traces / analytics JSON or JSONL) from a directory or file into the knowledge base as telemetry artifacts; runs data-driven crash analysis on each new crash. Pass `format` to force a format (sentry|crashlytics|performance|analytics) instead of auto-detecting', {
    type: 'object',
    properties: {
      path: { type: 'string' },
      analyze: { type: 'boolean' },
      format: { type: 'string', enum: ['sentry', 'crashlytics', 'performance', 'analytics'] },
    },
  }, 'artifactStore')
  async ingestTelemetry(args: Record<string, unknown>): Promise<string> {
    const store = this.store()
    const root = this.ctx.engine.getSnapshot()?.project.root || process.cwd()
    const requested = (args.path as string | undefined) || ''
    if (args.format !== undefined && typeof args.format === 'string' && !isTelemetryFormat(args.format)) {
      return `Unknown telemetry format: ${args.format}. Valid formats: sentry, crashlytics, performance, analytics`
    }
    const format = typeof args.format === 'string' ? (args.format as TelemetryFormat) : undefined
    const target = requested
      ? join(root, requested)
      : TelemetryIngestionService.findDefaultDir(root)
    if (!target || !existsSync(target)) {
      return `No telemetry exports found. Drop Sentry / Crashlytics / trace / analytics exports into ${requested || '`.vectalon/telemetry/` or `telemetry/`'} and re-run, or pass an explicit path.`
    }

    const service = new TelemetryIngestionService(store)
    const result = statSync(target).isFile()
      ? service.ingestFile(target, { format })
      : service.ingestDirectory(target, { format })

    // Data-driven analysis pass: link a crash root-cause analysis to each
    // newly ingested crash artifact.
    if (args.analyze !== false) {
      const analyzer = new RootCauseAnalyzer()
      for (const crash of result.crashes) {
        const analysis = analyzer.renderCrash(analyzer.analyzeCrash(crash))
        const artifact = this.persistArtifact('telemetry', `Crash Analysis: ${crash.exceptionType || crash.message || crash.id}`, analysis)
        const crashArtifact = result.artifacts.find(a => {
          const stored = store.get(a.id)
          return stored?.meta.eventId === crash.id
        })
        if (artifact && crashArtifact) {
          store.link(crashArtifact.id, artifact.id)
        }
      }
    }

    return JSON.stringify(
      {
        target,
        filesScanned: result.filesScanned,
        events: result.events.length,
        crashes: result.crashes.length,
        traces: result.traces.length,
        analytics: result.analytics.length,
        skipped: result.skipped,
        artifacts: result.artifacts.map(a => ({ id: a.id, title: a.title })),
        errors: result.errors,
      },
      null,
      2
    )
  }

  @mcpTool('get_team_context', 'Get aggregated knowledge context across team projects, scoped by team, project, and role', {
    type: 'object',
    properties: {
      team: { type: 'string' },
      project: { type: 'string' },
      role: { type: 'string', enum: ARTIFACT_ROLES },
    },
  }, 'teamStore')
  async getTeamContext(args: Record<string, unknown>): Promise<string> {
    const teamStore = this.teamStore()
    const role = args.role as string
    if (role && !ARTIFACT_ROLES.includes(role as never)) {
      throw new Error(`Unknown role: ${role}. Valid roles: ${ARTIFACT_ROLES.join(', ')}`)
    }
    return teamStore.context({
      team: args.team as string | undefined,
      project: args.project as string | undefined,
      role: (role as ArtifactRole) || undefined,
    })
  }

  @mcpTool('search_knowledge', 'Search artifacts across the team brain, ranked by relevance × provenance confidence (recent, high-confidence context wins), scoped by team, project, and type', {
    type: 'object',
    properties: {
      query: { type: 'string' },
      team: { type: 'string' },
      project: { type: 'string' },
      type: { type: 'string', enum: ARTIFACT_TYPES },
      limit: { type: 'number' },
    },
    required: ['query'],
  }, 'teamStore')
  async searchKnowledge(args: Record<string, unknown>): Promise<string> {
    const teamStore = this.teamStore()
    const query = (args.query as string) || ''
    if (!query) {
      return 'No query provided. Pass a query string to search across the team brain.'
    }

    const type = args.type as string
    if (type && !ARTIFACT_TYPES.includes(type as never)) {
      throw new Error(`Unknown artifact type: ${type}. Valid types: ${ARTIFACT_TYPES.join(', ')}`)
    }

    const results = await teamStore.searchRemote({
      query,
      team: args.team as string | undefined,
      project: args.project as string | undefined,
      type: (type as ArtifactType) || undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    })

    if (results.length === 0) {
      return 'No artifacts matched the query across the registered projects.'
    }

    return JSON.stringify(
      results.map(r => ({
        project: r.project,
        team: r.team || null,
        score: r.score,
        rankedScore: r.rankedScore,
        confidence: r.confidence,
        provenance: {
          source: r.provenance.source,
          stalenessDate: r.provenance.stalenessDate,
          refreshedAt: r.provenance.refreshedAt,
        },
        lexicalScore: r.lexicalScore,
        semanticScore: r.semanticScore,
        artifact: {
          id: r.artifact.id,
          type: r.artifact.type,
          title: r.artifact.title,
          status: r.artifact.status,
          updatedAt: r.artifact.updatedAt,
          content: r.artifact.content,
        },
      })),
      null,
      2
    )
  }

  /** Artifact store — available whenever these tools are registered. */
  private store(): ArtifactStore {
    return this.ctx.artifactStore as ArtifactStore
  }

  /** Team store — available whenever these tools are registered. */
  private teamStore(): TeamStore {
    return this.ctx.teamStore as TeamStore
  }
}
