import type { AgentTool, ToolCall, ToolResult, ProtocolType } from './types'
import { ContextEngine } from '../harness/ContextEngine'
import { ModelRouter } from '../model/ModelRouter'
import { ArtifactStore } from '../knowledge/ArtifactStore'
import { TeamStore } from '../knowledge/TeamStore'
import { RoleEngine } from '../knowledge/RoleEngine'
import { ARTIFACT_ROLES, ARTIFACT_TYPES } from '../knowledge/artifactTypes'
import type { Artifact, ArtifactRole, ArtifactType } from '../knowledge/artifactTypes'
import { RequirementWriter } from '../sdlc/RequirementWriter'
import { StoryWriter } from '../sdlc/StoryWriter'
import { AcceptanceCriteriaWriter } from '../sdlc/AcceptanceCriteriaWriter'
import { GapAnalyzer } from '../sdlc/GapAnalyzer'
import { SupportTicketAnalyzer } from '../sdlc/SupportTicketAnalyzer'
import { TestPlanWriter } from '../sdlc/TestPlanWriter'
import { TestCaseWriter } from '../sdlc/TestCaseWriter'
import { BugTriageAnalyzer } from '../sdlc/BugTriageAnalyzer'
import { RootCauseAnalyzer } from '../sdlc/RootCauseAnalyzer'
import { CodeReviewAnalyzer } from '../sdlc/CodeReviewAnalyzer'
import { RefactorSuggester } from '../sdlc/RefactorSuggester'
import { ADRWriter } from '../sdlc/ADRWriter'
import { TradeoffAnalyzer } from '../sdlc/TradeoffAnalyzer'
import type { TradeoffOption } from '../sdlc/TradeoffAnalyzer'
import { ThreatModeler } from '../sdlc/ThreatModeler'
import { AccessibilityChecker } from '../sdlc/AccessibilityChecker'
import { DesignSystemExtractor } from '../sdlc/DesignSystemExtractor'
import { WireframeGenerator } from '../sdlc/WireframeGenerator'
import { ReleaseNoteWriter } from '../sdlc/ReleaseNoteWriter'
import { IncidentAnalyzer } from '../sdlc/IncidentAnalyzer'
import { RunbookWriter } from '../sdlc/RunbookWriter'
import { KpiReportAnalyzer } from '../sdlc/KpiReportAnalyzer'
import type { KpiMetric } from '../sdlc/KpiReportAnalyzer'

type ToolHandler = (args: Record<string, unknown>) => Promise<string>

const LATEST_KNOWN: Record<string, string> = {
  'react-native': '0.74.0',
  react: '18.3.1',
  typescript: '5.5.0',
  jest: '29.7.0',
  '@react-navigation/native': '6.1.0',
}

export class MCPServer {
  private tools: Map<string, ToolHandler> = new Map()
  private protocol: ProtocolType
  private engine: ContextEngine
  private modelRouter: ModelRouter
  private artifactStore: ArtifactStore | null
  private teamStore: TeamStore | null

  constructor(
    engine: ContextEngine,
    modelRouter: ModelRouter,
    protocol: ProtocolType = 'mcp',
    artifactStore: ArtifactStore | null = null,
    teamStore: TeamStore | null = null
  ) {
    this.engine = engine
    this.modelRouter = modelRouter
    this.protocol = protocol
    this.artifactStore = artifactStore
    this.teamStore = teamStore
    this.registerDefaultTools()
  }

  async start(port = 0): Promise<void> {
    switch (this.protocol) {
      case 'mcp':
      case 'stdio':
        await this.startStdio()
        break
      case 'sse':
      case 'http':
        await this.startHTTP(port)
        break
    }
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    const handler = this.tools.get(call.name)

    if (!handler) {
      return { id: call.id, content: `Unknown tool: ${call.name}`, isError: true }
    }

    try {
      const content = await handler(call.arguments)
      return { id: call.id, content }
    } catch (err) {
      return {
        id: call.id,
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }

  getToolList(): AgentTool[] {
    return [
      {
        name: 'get_project_context',
        description: 'Get the full project context including structure, components, and patterns',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'generate_component',
        description: 'Generate a new React Native component following project conventions',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['functional'] },
            usesNavigation: { type: 'boolean' },
            usesStyleSheet: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
      {
        name: 'write_test',
        description: 'Write a test file for a given component or module; pass acceptance criteria for deterministic cases',
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            framework: { type: 'string', enum: ['jest', 'detox'] },
            acceptanceCriteria: { type: 'string' },
          },
          required: ['target'],
        },
      },
      {
        name: 'analyze_error',
        description: 'Analyze a build or runtime error and provide fixes',
        inputSchema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            context: { type: 'string' },
          },
          required: ['error'],
        },
      },
      {
        name: 'suggest_dependency_update',
        description: 'Suggest dependency updates based on project config',
        inputSchema: {
          type: 'object',
          properties: {
            packageName: { type: 'string' },
          },
        },
      },
      {
        name: 'get_learned_patterns',
        description: 'View patterns the harness has learned about this project',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'write_prd',
        description: 'Write a Product Requirements Document scaffold for a feature',
        inputSchema: {
          type: 'object',
          properties: {
            projectName: { type: 'string' },
            feature: { type: 'string' },
            featureIdeas: { type: 'string' },
            enhance: { type: 'boolean' },
          },
          required: ['feature'],
        },
      },
      {
        name: 'write_user_stories',
        description: 'Write user stories for a feature, one per persona',
        inputSchema: {
          type: 'object',
          properties: {
            feature: { type: 'string' },
            personas: { type: 'string' },
            parentId: { type: 'string' },
            enhance: { type: 'boolean' },
          },
          required: ['feature'],
        },
      },
      {
        name: 'define_acceptance_criteria',
        description: 'Define Given/When/Then acceptance criteria for a user story',
        inputSchema: {
          type: 'object',
          properties: {
            story: { type: 'string' },
            parentId: { type: 'string' },
          },
          required: ['story'],
        },
      },
      {
        name: 'analyze_support_tickets',
        description: 'Group support tickets into themes and suggest next steps',
        inputSchema: {
          type: 'object',
          properties: {
            tickets: { type: 'string' },
          },
          required: ['tickets'],
        },
      },
      {
        name: 'run_gap_analysis',
        description: 'Compare desired capabilities against current ones and report gaps',
        inputSchema: {
          type: 'object',
          properties: {
            desired: { type: 'string' },
            current: { type: 'string' },
          },
          required: ['desired', 'current'],
        },
      },
      {
        name: 'write_test_plan',
        description: 'Write a QA test plan scaffold for a feature',
        inputSchema: {
          type: 'object',
          properties: {
            feature: { type: 'string' },
            scope: { type: 'string' },
            environments: { type: 'string' },
          },
          required: ['feature'],
        },
      },
      {
        name: 'triage_bugs',
        description: 'Triage a list of bug reports by severity and priority',
        inputSchema: {
          type: 'object',
          properties: {
            bugs: { type: 'string' },
          },
          required: ['bugs'],
        },
      },
      {
        name: 'analyze_root_cause',
        description: 'Analyze the probable root cause of a production issue',
        inputSchema: {
          type: 'object',
          properties: {
            issue: { type: 'string' },
          },
          required: ['issue'],
        },
      },
      {
        name: 'review_code',
        description: 'Run deterministic code review checks over a code snippet',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'suggest_refactors',
        description: 'Suggest refactors for a code snippet based on static heuristics',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            filename: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'write_adr',
        description: 'Write an Architecture Decision Record scaffold',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            context: { type: 'string' },
            options: { type: 'string' },
            decision: { type: 'string' },
            number: { type: 'number' },
          },
          required: ['title', 'context'],
        },
      },
      {
        name: 'analyze_tradeoffs',
        description: 'Rank architecture options by scored attributes (JSON array of { name, scores })',
        inputSchema: {
          type: 'object',
          properties: {
            options: { type: 'string' },
          },
          required: ['options'],
        },
      },
      {
        name: 'threat_model',
        description: 'Produce a STRIDE threat model for a feature',
        inputSchema: {
          type: 'object',
          properties: {
            feature: { type: 'string' },
            components: { type: 'string' },
          },
        },
      },
      {
        name: 'check_accessibility',
        description: 'Run deterministic accessibility checks over JSX code',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'extract_design_system',
        description: 'Extract design tokens (colors, spacing, fonts, radius) from style code',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
          },
          required: ['code'],
        },
      },
      {
        name: 'generate_wireframe',
        description: 'Generate an ASCII wireframe for a screen from a section list',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            sections: { type: 'string' },
          },
          required: ['title'],
        },
      },
      {
        name: 'write_release_notes',
        description: 'Write release notes for a version, auto-categorizing the change list',
        inputSchema: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            date: { type: 'string' },
            changes: { type: 'string' },
          },
          required: ['version'],
        },
      },
      {
        name: 'analyze_incident',
        description: 'Analyze a production incident: severity, root-cause bucket, timeline, and actions',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['sev1', 'sev2', 'sev3'] },
            impact: { type: 'string' },
          },
          required: ['title', 'description'],
        },
      },
      {
        name: 'write_runbook',
        description: 'Write an ops runbook with symptoms, numbered steps, and escalation',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            symptoms: { type: 'string' },
            steps: { type: 'string' },
            owner: { type: 'string' },
          },
          required: ['title'],
        },
      },
      {
        name: 'analyze_kpis',
        description: 'Evaluate KPI metrics with baselines and targets (JSON array of { name, current, previous, target })',
        inputSchema: {
          type: 'object',
          properties: {
            metrics: { type: 'string' },
          },
          required: ['metrics'],
        },
      },
      ...(this.artifactStore
        ? [
            {
              name: 'list_artifacts',
              description: 'List artifacts in the knowledge base',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'get_artifact',
              description: 'Get a single artifact from the knowledge base by id',
              inputSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            },
            {
              name: 'get_knowledge_context',
              description: 'Get knowledge base context scoped to a role',
              inputSchema: {
                type: 'object',
                properties: { role: { type: 'string', enum: ARTIFACT_ROLES } },
                required: ['role'],
              },
            },
            {
              name: 'link_artifacts',
              description: 'Link a parent artifact to a child artifact',
              inputSchema: {
                type: 'object',
                properties: {
                  parentId: { type: 'string' },
                  childId: { type: 'string' },
                },
                required: ['parentId', 'childId'],
              },
            },
          ]
        : []),
      ...(this.teamStore
        ? [
            {
              name: 'get_team_context',
              description: 'Get aggregated knowledge context across team projects, scoped by team, project, and role',
              inputSchema: {
                type: 'object',
                properties: {
                  team: { type: 'string' },
                  project: { type: 'string' },
                  role: { type: 'string', enum: ARTIFACT_ROLES },
                },
              },
            },
            {
              name: 'search_knowledge',
              description: 'Search artifacts across the team brain, ranked by relevance, scoped by team, project, and type',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  team: { type: 'string' },
                  project: { type: 'string' },
                  type: { type: 'string', enum: ARTIFACT_TYPES },
                  limit: { type: 'number' },
                },
                required: ['query'],
              },
            },
          ]
        : []),
    ]
  }

  private registerDefaultTools(): void {
    this.tools.set('get_project_context', async () => {
      const snapshot = this.engine.getSnapshot()
      if (!snapshot) return 'No snapshot available. Run `rn-vectalon init` first.'
      return this.engine.buildContextPrompt()
    })

    this.tools.set('get_learned_patterns', async () => {
      const store = this.engine.getPatternStore()
      if (!store) return 'No learned patterns available.'
      return JSON.stringify(store.getActivePatterns(), null, 2)
    })

    this.registerBATools()
    this.registerQATools()
    this.registerArchTools()
    this.registerOpsTools()

    this.tools.set('suggest_dependency_update', async (args: Record<string, unknown>) => {
      const packageName = (args.packageName as string) || ''
      const snapshot = this.engine.getSnapshot()
      const version =
        snapshot?.project.dependencies[packageName] ||
        snapshot?.project.devDependencies[packageName]

      if (!version) {
        return JSON.stringify(
          {
            packageName,
            status: 'not-installed',
            message: `Package "${packageName}" is not in this project's dependencies.`,
          },
          null,
          2
        )
      }

      const latest = LATEST_KNOWN[packageName]
      if (!latest) {
        return JSON.stringify(
          {
            packageName,
            currentVersion: version,
            status: 'unknown-latest',
            message: `Unable to determine the latest version of ${packageName} without a network call.`,
          },
          null,
          2
        )
      }

      const current = version.replace(/[^\d.]/g, '')
      const upToDate = current === latest.replace(/[^\d.]/g, '')
      return JSON.stringify(
        {
          packageName,
          currentVersion: version,
          latestKnown: latest,
          status: upToDate ? 'up-to-date' : 'update-available',
          message: upToDate
            ? `${packageName}@${version} is up to date.`
            : `Update ${packageName} from ${version} to ${latest}: npm install ${packageName}@${latest}`,
        },
        null,
        2
      )
    })

    this.tools.set('analyze_error', async (args: Record<string, unknown>) => {
      const error = args.error as string
      const context = (args.context as string) || ''

      const snapshot = this.engine.getSnapshot()
      const projectContext = snapshot ? this.engine.buildContextPrompt() : ''

      const response = await this.modelRouter.generate({
        prompt: `Analyze this React Native error and provide a fix:\n\n${error}`,
        context: context || projectContext,
        systemPrompt: 'You are a React Native debugging expert. Analyze the error and suggest specific fixes.',
        temperature: 0.2,
      })

      return response.content
    })

    this.tools.set('generate_component', async (args: Record<string, unknown>) => {
      const name = args.name as string
      const type = (args.type as string) || 'functional'

      const snapshot = this.engine.getSnapshot()
      const projectContext = snapshot ? this.engine.buildContextPrompt() : ''

      const response = await this.modelRouter.generate({
        prompt: `Generate a React Native ${type} component named "${name}".`,
        context: projectContext,
        systemPrompt: 'You are an expert React Native developer. Generate clean, well-structured components.',
        temperature: 0.3,
      })

      return response.content
    })

    this.tools.set('write_test', async (args: Record<string, unknown>) => {
      const target = args.target as string
      const framework = (args.framework as string) || 'jest'
      const acceptanceCriteria = (args.acceptanceCriteria as string) || ''

      if (acceptanceCriteria) {
        const component = extractComponentName(target)
        const content = new TestCaseWriter().writeTestCases(acceptanceCriteria, component)
        this.persistArtifact('qa', `Test Cases: ${target}`, content)
        return content
      }

      const response = await this.modelRouter.generate({
        prompt: `Write ${framework} tests for: ${target}`,
        systemPrompt: 'You are a testing expert for React Native. Generate comprehensive tests.',
        temperature: 0.2,
      })

      return response.content
    })

    if (this.artifactStore) {
      this.registerKnowledgeTools()
    }
    if (this.teamStore) {
      this.registerTeamTools()
    }
  }

  private registerBATools(): void {
    this.tools.set('write_prd', async (args: Record<string, unknown>) => {
      const feature = (args.feature as string) || 'untitled feature'
      const snapshot = this.engine.getSnapshot()
      const projectName = (args.projectName as string) || snapshot?.project.name || 'project'
      const featureIdeas = parseList(args.featureIdeas)

      const scaffold = new RequirementWriter().writePRD({ projectName, feature, featureIdeas })
      const content = await this.maybeEnhance(
        args,
        scaffold,
        'You are a product manager writing a Product Requirements Document. Expand the scaffold into a complete PRD.'
      )
      this.persistArtifact('product', `PRD: ${feature}`, content)
      return content
    })

    this.tools.set('write_user_stories', async (args: Record<string, unknown>) => {
      const feature = (args.feature as string) || 'untitled feature'
      const personas = parseList(args.personas)

      const scaffold = new StoryWriter().writeUserStories({ feature, personas })
      const content = await this.maybeEnhance(
        args,
        scaffold,
        'You are a business analyst writing user stories. Expand the scaffold into complete stories with the right format.'
      )
      this.persistArtifact('requirements', `User Stories: ${feature}`, content, args.parentId)
      return content
    })

    this.tools.set('define_acceptance_criteria', async (args: Record<string, unknown>) => {
      const story = (args.story as string) || ''
      const content = new AcceptanceCriteriaWriter().writeAcceptanceCriteria(story)
      const label = story.replace(/\s+/g, ' ').slice(0, 60)
      this.persistArtifact('requirements', `Acceptance Criteria: ${label}`, content, args.parentId)
      return content
    })

    this.tools.set('analyze_support_tickets', async (args: Record<string, unknown>) => {
      const analyzer = new SupportTicketAnalyzer()
      const analysis = analyzer.analyze(parseTickets(args.tickets))
      const content = analyzer.render(analysis)
      this.persistArtifact('research', 'Support Ticket Analysis', content)
      return content
    })

    this.tools.set('run_gap_analysis', async (args: Record<string, unknown>) => {
      const analyzer = new GapAnalyzer()
      const analysis = analyzer.analyze({
        desired: parseList(args.desired),
        current: parseList(args.current),
      })
      const content = analyzer.render(analysis)
      this.persistArtifact('research', 'Gap Analysis', content)
      return content
    })
  }

  private async maybeEnhance(
    args: Record<string, unknown>,
    scaffold: string,
    systemPrompt: string
  ): Promise<string> {
    if (args.enhance !== true) return scaffold
    try {
      const response = await this.modelRouter.generate({
        prompt: `Expand the following scaffold into a complete document:\n\n${scaffold}`,
        systemPrompt,
        temperature: 0.3,
      })
      return response.content
    } catch {
      return scaffold
    }
  }
  private registerQATools(): void {
    this.tools.set('write_test_plan', async (args: Record<string, unknown>) => {
      const feature = (args.feature as string) || 'untitled feature'
      const content = new TestPlanWriter().writeTestPlan({
        feature,
        scope: parseList(args.scope),
        environments: parseList(args.environments),
      })
      this.persistArtifact('qa', `Test Plan: ${feature}`, content)
      return content
    })

    this.tools.set('triage_bugs', async (args: Record<string, unknown>) => {
      const analyzer = new BugTriageAnalyzer()
      const triage = analyzer.triage(parseTickets(args.bugs))
      const content = analyzer.render(triage)
      this.persistArtifact('qa', 'Bug Triage', content)
      return content
    })

    this.tools.set('analyze_root_cause', async (args: Record<string, unknown>) => {
      const issue = (args.issue as string) || ''
      const result = new RootCauseAnalyzer().analyze(issue)
      const content = new RootCauseAnalyzer().render(result)
      this.persistArtifact('qa', 'Root Cause Analysis', content)
      return content
    })

    this.tools.set('review_code', async (args: Record<string, unknown>) => {
      const code = (args.code as string) || ''
      const findings = new CodeReviewAnalyzer().review(code, (args.language as string) || 'tsx')
      const content = new CodeReviewAnalyzer().render(findings)
      this.persistArtifact('engineering', 'Code Review', content)
      return content
    })

    this.tools.set('suggest_refactors', async (args: Record<string, unknown>) => {
      const code = (args.code as string) || ''
      const suggestions = new RefactorSuggester().suggest(code, (args.filename as string) || 'Component.tsx')
      const content = new RefactorSuggester().render(suggestions)
      this.persistArtifact('engineering', 'Refactor Suggestions', content)
      return content
    })
  }

  private registerOpsTools(): void {
    this.tools.set('write_release_notes', async (args: Record<string, unknown>) => {
      const version = (args.version as string) || '0.0.0'
      const content = new ReleaseNoteWriter().writeReleaseNotes({
        version,
        date: (args.date as string) || undefined,
        changes: parseList(args.changes),
      })
      this.persistArtifact('devops', `Release Notes: v${version}`, content)
      return content
    })

    this.tools.set('analyze_incident', async (args: Record<string, unknown>) => {
      const analyzer = new IncidentAnalyzer()
      const analysis = analyzer.analyze({
        title: (args.title as string) || 'Untitled incident',
        description: (args.description as string) || '',
        severity: args.severity as 'sev1' | 'sev2' | 'sev3' | undefined,
        impact: (args.impact as string) || undefined,
      })
      const content = analyzer.render(analysis)
      this.persistArtifact('operations', `Incident: ${analysis.title}`, content)
      return content
    })

    this.tools.set('write_runbook', async (args: Record<string, unknown>) => {
      const title = (args.title as string) || 'Untitled runbook'
      const content = new RunbookWriter().writeRunbook({
        title,
        symptoms: parseList(args.symptoms),
        steps: parseList(args.steps),
        owner: (args.owner as string) || undefined,
      })
      this.persistArtifact('operations', `Runbook: ${title}`, content)
      return content
    })

    this.tools.set('analyze_kpis', async (args: Record<string, unknown>) => {
      const raw = (args.metrics as string) || ''
      let metrics: KpiMetric[]
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) throw new Error('not an array')
        metrics = parsed as KpiMetric[]
      } catch {
        return `Invalid metrics JSON. Expected an array of { name, current, previous?, target? }. Received: ${raw.slice(0, 200)}`
      }

      const analyzer = new KpiReportAnalyzer()
      const content = analyzer.render(analyzer.analyze(metrics))
      this.persistArtifact('analytics', 'KPI Report', content)
      return content
    })
  }

  private persistArtifact(
    type: ArtifactType,
    title: string,
    content: string,
    parentId?: unknown
  ): Artifact | null {
    if (!this.artifactStore) return null
    const artifact = this.artifactStore.add({ type, title, content, source: 'generated' })
    if (parentId && this.artifactStore.get(String(parentId))) {
      this.artifactStore.link(String(parentId), artifact.id)
    }
    return artifact
  }

  private registerArchTools(): void {
    this.tools.set('write_adr', async (args: Record<string, unknown>) => {
      const title = (args.title as string) || 'Untitled decision'
      const context = (args.context as string) || 'No context provided.'
      const content = new ADRWriter().writeADR({
        title,
        context,
        options: parseList(args.options),
        decision: (args.decision as string) || 'TBD',
        number: typeof args.number === 'number' ? args.number : undefined,
      })
      this.persistArtifact('architecture', `ADR: ${title}`, content)
      return content
    })

    this.tools.set('analyze_tradeoffs', async (args: Record<string, unknown>) => {
      const raw = (args.options as string) || ''
      let options: TradeoffOption[]
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) throw new Error('not an array')
        options = parsed as TradeoffOption[]
      } catch {
        return `Invalid options JSON. Expected an array of { name, scores: { attribute: 1-5 } }. Received: ${raw.slice(0, 200)}`
      }

      const analyzer = new TradeoffAnalyzer()
      const result = analyzer.analyze(options)
      const content = analyzer.render(result)
      this.persistArtifact('architecture', 'Tradeoff Analysis', content)
      return content
    })

    this.tools.set('threat_model', async (args: Record<string, unknown>) => {
      const modeler = new ThreatModeler()
      const threats = modeler.threatModel(parseList(args.feature), parseList(args.components))
      const content = modeler.render(threats)
      this.persistArtifact('security', 'Threat Model', content)
      return content
    })

    this.tools.set('check_accessibility', async (args: Record<string, unknown>) => {
      const code = (args.code as string) || ''
      const checker = new AccessibilityChecker()
      const findings = checker.check(code)
      const content = checker.render(findings)
      this.persistArtifact('design', 'Accessibility Check', content)
      return content
    })

    this.tools.set('extract_design_system', async (args: Record<string, unknown>) => {
      const code = (args.code as string) || ''
      const extractor = new DesignSystemExtractor()
      const ds = extractor.extract(code)
      const content = extractor.render(ds)
      this.persistArtifact('design', 'Design System', content)
      return content
    })

    this.tools.set('generate_wireframe', async (args: Record<string, unknown>) => {
      const title = (args.title as string) || 'Screen'
      const sections = parseList(args.sections)
      const content = new WireframeGenerator().generate(title, sections)
      this.persistArtifact('design', `Wireframe: ${title}`, content)
      return content
    })
  }

  private registerKnowledgeTools(): void {
    const store = this.artifactStore as ArtifactStore

    this.tools.set('list_artifacts', async () => {
      const summary = store.list().map(a => ({
        id: a.id,
        type: a.type,
        title: a.title,
        status: a.status,
        version: a.version,
        updatedAt: a.updatedAt,
      }))
      return JSON.stringify(summary, null, 2)
    })

    this.tools.set('get_artifact', async (args: Record<string, unknown>) => {
      const artifact = store.get(args.id as string)
      if (!artifact) throw new Error(`Artifact not found: ${args.id}`)
      return JSON.stringify(artifact, null, 2)
    })

    this.tools.set('get_knowledge_context', async (args: Record<string, unknown>) => {
      const role = args.role as string
      if (!ARTIFACT_ROLES.includes(role as never)) {
        throw new Error(`Unknown role: ${role}. Valid roles: ${ARTIFACT_ROLES.join(', ')}`)
      }
      return new RoleEngine().buildContext(role as never, store.list())
    })

    this.tools.set('link_artifacts', async (args: Record<string, unknown>) => {
      const parentId = args.parentId as string
      const childId = args.childId as string
      if (!store.link(parentId, childId)) {
        throw new Error(`Failed to link artifacts: missing id`)
      }
      return `Linked ${parentId} -> ${childId}`
    })
  }

  private registerTeamTools(): void {
    const teamStore = this.teamStore as TeamStore

    this.tools.set('get_team_context', async (args: Record<string, unknown>) => {
      const role = args.role as string
      if (role && !ARTIFACT_ROLES.includes(role as never)) {
        throw new Error(`Unknown role: ${role}. Valid roles: ${ARTIFACT_ROLES.join(', ')}`)
      }
      return teamStore.context({
        team: args.team as string | undefined,
        project: args.project as string | undefined,
        role: (role as ArtifactRole) || undefined,
      })
    })

    this.tools.set('search_knowledge', async (args: Record<string, unknown>) => {
      const query = (args.query as string) || ''
      if (!query) {
        return 'No query provided. Pass a query string to search across the team brain.'
      }

      const type = args.type as string
      if (type && !ARTIFACT_TYPES.includes(type as never)) {
        throw new Error(`Unknown artifact type: ${type}. Valid types: ${ARTIFACT_TYPES.join(', ')}`)
      }

      const results = teamStore.search({
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
    })
  }

  private async startStdio(): Promise<void> {
    const readline = (await import('readline')).default.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })

    readline.on('line', async (line: string) => {
      try {
        const call: ToolCall = JSON.parse(line)
        this.sendResult(await this.handleToolCall(call))
      } catch (err) {
        this.sendResult({
          id: 'error',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        })
      }
    })
  }

  private sendResult(result: ToolResult): void {
    process.stdout.write(JSON.stringify(result) + '\n')
  }

  private async startHTTP(port: number): Promise<void> {
    const http = await import('http')
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        tools: this.getToolList(),
        status: 'running',
      }))
    })

    server.listen(port, () => {
      process.stderr.write(`rn-vectalon MCP server running on port ${port}\n`)
    })
  }
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(v => typeof v === 'string').map(v => (v as string).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  return []
}

function parseTickets(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(v => typeof v === 'string') as string[]
  }
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.replace(/^[-*]\s*/, '').replace(/^[A-Za-z]+[-_]?\d+\s*[:.]\s*/, ''))
  }
  return []
}

function extractComponentName(target: string): string {
  const base = (target.match(/[^/\\]+$/)?.[0] || target).replace(/\.(tsx?|jsx?)$/, '')
  return base || 'Component'
}
