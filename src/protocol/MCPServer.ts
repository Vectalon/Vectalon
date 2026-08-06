import type { AgentTool, ToolCall, ToolResult, ProtocolType } from './types'
import type { McpClientHandle } from './subMcp'
import { ContextEngine } from '../harness/ContextEngine'
import { ModelRouter } from '../model/ModelRouter'
import { ArtifactStore } from '../knowledge/ArtifactStore'
import { TeamStore } from '../knowledge/TeamStore'
import { RoleEngine } from '../knowledge/RoleEngine'
import { ARTIFACT_ROLES, ARTIFACT_TYPES } from '../knowledge/artifactTypes'
import type { Artifact, ArtifactRole, ArtifactType } from '../knowledge/artifactTypes'
import { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState } from '../workflows'
import { runAgentLoop } from '../model/toolCalling'
import { createAdapters } from '../adapters'
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
import { reviewCodeWithLLM, formatLLMReview } from '../sdlc/LLMCodeReviewer'
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
import { MaestroFlowWriter } from '../sdlc/MaestroFlowWriter'
import { DeviceController, type DevicePlatform } from '../adapters/deviceControl'
import { runGuardrails } from '../guardrails'
import type { GuardrailConventions } from '../guardrails'
type ToolHandler = (args: Record<string, unknown>) => Promise<string>

const LATEST_KNOWN: Record<string, string> = {
  'react-native': '0.74.0',
  react: '18.3.1',
  typescript: '5.5.0',
  jest: '29.7.0',
  '@react-navigation/native': '6.1.0',
}

export interface MCPServerOptions {
  /**
   * When true, device-control tools (device_boot, device_screenshot, …)
   * execute real simulator/emulator commands. Defaults to false — tools
   * describe the command they would run (safe, deterministic, CI-friendly).
   */
  deviceControlLive?: boolean
}

export class MCPServer {
  private tools: Map<string, ToolHandler> = new Map()
  private protocol: ProtocolType
  private engine: ContextEngine
  private modelRouter: ModelRouter
  private artifactStore: ArtifactStore | null
  private teamStore: TeamStore | null
  private subMcpClients: McpClientHandle[]
  private deviceControlLive: boolean
  private httpServer: import('http').Server | null = null

  constructor(
    engine: ContextEngine,
    modelRouter: ModelRouter,
    protocol: ProtocolType = 'mcp',
    artifactStore: ArtifactStore | null = null,
    teamStore: TeamStore | null = null,
    subMcpClients: McpClientHandle[] = [],
    options: MCPServerOptions = {}
  ) {
    this.engine = engine
    this.modelRouter = modelRouter
    this.protocol = protocol
    this.artifactStore = artifactStore
    this.teamStore = teamStore
    this.subMcpClients = subMcpClients
    this.deviceControlLive = options.deviceControlLive === true
    this.registerDefaultTools()
  }

  async start(port = 0): Promise<number | void> {
    switch (this.protocol) {
      case 'mcp':
      case 'stdio':
        await this.startStdio()
        break
      case 'sse':
      case 'http':
        return this.startHTTP(port)
    }
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    const proxied = await this.tryHandleProxiedCall(call)
    if (proxied) return proxied

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
    // Real proxied tools from every started sub-MCP server (spawned by
    // `vectalon serve` via startEnabledMcpClients), namespaced by item id so
    // `metro-mcp__get_console_logs` can't collide with parent tool names.
    const proxiedTools: AgentTool[] = this.subMcpClients.flatMap(client =>
      client.tools.map(tool => ({
        name: `${client.item.id}__${tool.name}`,
        description: `[${client.item.name}] ${tool.description}`,
        inputSchema: tool.inputSchema,
      }))
    )

    return [
      ...proxiedTools,
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
        name: 'check_guardrails',
        description: 'Run the project guardrail rule set over a code snippet and report pass/fail findings with line numbers (JSON)',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            filePath: { type: 'string' },
          },
          required: ['content'],
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
        name: 'run_agent',
        description: 'Run the local model as an agent over the SDK tools: it can call any listed tool (including proxied MCP tools) and returns a final answer',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'execute_workflow',
        description: 'Run a named SDLC workflow end-to-end for a given prompt (e.g. feature-development)',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: { type: 'string', enum: ['feature-development'] },
            prompt: { type: 'string' },
          },
          required: ['workflowId', 'prompt'],
        },
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
      {
        name: 'device_boot',
        description: 'Boot a simulator/emulator (xcrun simctl boot / emulator -avd). Pass platform and optional device/AVD name',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            device: { type: 'string' },
          },
        },
      },
      {
        name: 'device_screenshot',
        description: 'Capture a screenshot of the booted device to .vectalon/artifacts/screenshots/ (or a given path)',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            path: { type: 'string' },
          },
        },
      },
      {
        name: 'device_tap',
        description: 'Tap at screen coordinates on the booted device',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
        },
      },
      {
        name: 'device_swipe',
        description: 'Swipe from (x1, y1) to (x2, y2) on the booted device, optional duration in ms',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            x1: { type: 'number' },
            y1: { type: 'number' },
            x2: { type: 'number' },
            y2: { type: 'number' },
            duration: { type: 'number' },
          },
          required: ['x1', 'y1', 'x2', 'y2'],
        },
      },
      {
        name: 'device_open_url',
        description: 'Open a deep link on the booted device (simctl openurl / adb am start VIEW)',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            url: { type: 'string' },
          },
          required: ['url'],
        },
      },
      {
        name: 'device_logs',
        description: 'Read recent device logs (simctl log show / adb logcat), optional line limit',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['ios', 'android'] },
            limit: { type: 'number' },
          },
        },
      },
      {
        name: 'generate_maestro_flow',
        description: 'Generate a Maestro YAML E2E flow from acceptance criteria (Given/When/Then)',
        inputSchema: {
          type: 'object',
          properties: {
            acceptanceCriteria: { type: 'string' },
            featureName: { type: 'string' },
            appId: { type: 'string' },
          },
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

  /** Route `itemId__toolName` calls to the matching proxied sub-MCP client. */
  private async tryHandleProxiedCall(call: ToolCall): Promise<ToolResult | null> {
    const sep = call.name.indexOf('__')
    if (sep === -1) return null
    const itemId = call.name.slice(0, sep)
    const toolName = call.name.slice(sep + 2)
    const client = this.subMcpClients.find(c => c.item.id === itemId)
    if (!client) return null
    try {
      const result = await client.callTool(toolName, call.arguments)
      return { id: call.id, content: result.content, isError: result.isError }
    } catch (err) {
      return {
        id: call.id,
        content: `Error from ${itemId}: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  }

  /** Close the HTTP server (if any) and every proxied sub-MCP server. */
  close(): void {
    if (this.httpServer) {
      this.httpServer.close()
      this.httpServer = null
    }
    for (const client of this.subMcpClients) client.close()
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

    this.tools.set('run_agent', async (args: Record<string, unknown>) => {
      const prompt = (args.prompt as string) || ''
      if (!prompt) return 'Missing prompt'

      // Exclude run_agent itself so the loop can't recursively spawn nested
      // agent loops (bounded nesting would still multiply model calls).
      const tools = this.getToolList()
        .filter(t => t.name !== 'run_agent')
        .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
      const snapshot = this.engine.getSnapshot()
      const result = await runAgentLoop({
        modelRouter: this.modelRouter,
        prompt,
        tools,
        context: snapshot ? this.engine.buildContextPrompt() : undefined,
        execute: async (name, toolArgs) => {
          const toolResult = await this.handleToolCall({
            id: `agent-${Date.now()}`,
            name,
            arguments: toolArgs || {},
          })
          return toolResult.isError ? `Error: ${toolResult.content}` : toolResult.content
        },
      })

      const calls = result.calls.map(c => `- \`${c.tool}\` → ${c.result.slice(0, 200)}`).join('\n')
      return [
        '## Agent result',
        '',
        result.answer,
        '',
        `_Tool calls: ${result.calls.length} across ${result.iterations} iteration(s)_`,
        ...(result.calls.length > 0 ? ['', '### Tool call log', '', calls] : []),
      ].join('\n')
    })

    this.tools.set('execute_workflow', async (args: Record<string, unknown>) => {
      const workflowId = args.workflowId as string
      const prompt = args.prompt as string
      if (!workflowId || !prompt) {
        return 'Missing workflowId or prompt'
      }

      const workflow = getWorkflow(workflowId)
      if (!workflow) {
        return `Unknown workflow: ${workflowId}. Available: ${listWorkflows().map(w => w.id).join(', ')}`
      }

      const engine = new WorkflowEngine()
      const state = createWorkflowState(workflowId, prompt)
      const result = await engine.run(workflow, {
        projectRoot: process.cwd(),
        snapshot: this.engine.getSnapshot(),
        prompt,
        inputs: {},
        outputs: {},
        state,
        adapters: createAdapters({ dryRun: true }),
        modelRouter: this.modelRouter,
      })

      return JSON.stringify(result, null, 2)
    })

    this.registerBATools()
    this.registerQATools()
    this.registerArchTools()
    this.registerOpsTools()
    this.registerDeviceTools()

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

    this.tools.set('check_guardrails', async (args: Record<string, unknown>) => {
      const content = (args.content as string) || ''
      const filePath = (args.filePath as string) || 'snippet.tsx'
      if (!content) return 'Missing required field: content'
      const result = runGuardrails({ filePath, content, conventions: this.conventionsFromSnapshot() })
      return JSON.stringify(result, null, 2)
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
      const parts = [new CodeReviewAnalyzer().render(findings)]

      // Nit-picking LLM pass on top of the deterministic rules when a model is
      // available; falls back to rule-only output when the model is on its
      // fallback path (no downloaded model) or returns nothing parseable.
      const llmReview = await reviewCodeWithLLM(this.modelRouter, {
        code,
        fileName: (args.filename as string) || 'snippet.tsx',
        context: (args.context as string) || '',
      })
      if (llmReview) {
        parts.push(`## LLM Review\n\n${formatLLMReview(llmReview)}`)
      }

      const content = parts.join('\n\n')
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

  private deviceControllerFor(args: Record<string, unknown>): DeviceController {
    const root = this.engine.getSnapshot()?.project.root || process.cwd()
    const platform = args.platform as DevicePlatform | undefined
    return new DeviceController(root, {
      // Live control only when the serve command opted in; every other surface
      // (tests, default `serve`) gets a deterministic dry-run description.
      dryRun: !this.deviceControlLive,
      platform: platform === 'ios' || platform === 'android' ? platform : undefined,
    })
  }

  private formatDeviceResult(result: import('../adapters/deviceControl').DeviceActionResult): string {
    const fence = '```'
    const lines = [
      `**${result.success ? 'OK' : 'Failed'}**`,
      '',
      `${fence}bash`,
      result.command ? `$ ${result.command}` : '_no command — argument validation failed_',
      fence,
      '',
    ]
    if (result.stdout) lines.push(result.stdout.slice(0, 4000))
    if (result.stderr) lines.push(`\n**stderr**\n\n${fence}\n${result.stderr.slice(0, 2000)}\n${fence}`)
    return lines.join('\n')
  }

  private registerDeviceTools(): void {
    this.tools.set('device_boot', async (args) => {
      const result = await this.deviceControllerFor(args).boot(args.device as string | undefined)
      return this.formatDeviceResult(result)
    })

    this.tools.set('device_screenshot', async (args) => {
      const result = await this.deviceControllerFor(args).screenshot(args.path as string | undefined)
      return this.formatDeviceResult(result)
    })

    this.tools.set('device_tap', async (args) => {
      const result = await this.deviceControllerFor(args).tap(Number(args.x), Number(args.y))
      return this.formatDeviceResult(result)
    })

    this.tools.set('device_swipe', async (args) => {
      const result = await this.deviceControllerFor(args).swipe(
        Number(args.x1),
        Number(args.y1),
        Number(args.x2),
        Number(args.y2),
        args.duration === undefined ? undefined : Number(args.duration)
      )
      return this.formatDeviceResult(result)
    })

    this.tools.set('device_open_url', async (args) => {
      const result = await this.deviceControllerFor(args).openUrl((args.url as string) || '')
      return this.formatDeviceResult(result)
    })

    this.tools.set('device_logs', async (args) => {
      const result = await this.deviceControllerFor(args).logs(args.limit === undefined ? undefined : Number(args.limit))
      return this.formatDeviceResult(result)
    })

    this.tools.set('generate_maestro_flow', async (args) => {
      const criteria = (args.acceptanceCriteria as string) || ''
      const flow = new MaestroFlowWriter().writeFlow(criteria, {
        featureName: (args.featureName as string) || undefined,
        appId: (args.appId as string) || undefined,
      })
      const fence = '```'
      return ['## Maestro E2E flow', '', `${fence}yaml`, flow.trimEnd(), fence].join('\n')
    })
  }

  /** Project conventions for guardrail checks, derived from the scan snapshot. */
  private conventionsFromSnapshot(): GuardrailConventions {
    const snapshot = this.engine.getSnapshot()
    const components = snapshot?.components || []
    return {
      hasTypeScript: snapshot?.project.hasTypeScript,
      usesStyleSheet: components.some(c => c.usesStyleSheet),
      hasNavigation: components.some(c => c.usesNavigation),
      newArchitecture: snapshot?.project.newArchitecture,
      reactVersion: snapshot?.project.reactVersion,
      reactCompiler: snapshot?.project.reactCompiler,
    }
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

  private async startHTTP(port: number): Promise<number> {
    const http = await import('http')
    const server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res)
    })
    this.httpServer = server

    return new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, () => {
        const address = server.address()
        const bound = typeof address === 'object' && address ? address.port : port
        process.stderr.write(`rn-vectalon MCP server running on port ${bound}\n`)
        resolve(bound)
      })
    })
  }

  private async handleHttpRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const path = url.pathname
      const method = req.method || 'GET'

      const sendJson = (status: number, body: unknown): void => {
        if (res.writableEnded) return
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        res.end(JSON.stringify(body))
      }

      // CORS preflight for browser-based dashboards.
      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        res.end()
        return
      }

      // Tool discovery.
      if (method === 'GET' && (path === '/' || path === '/tools')) {
        sendJson(200, { tools: this.getToolList(), status: 'running' })
        return
      }

      // Tool invocation: POST /call or POST /invoke with a ToolCall JSON body
      // { id?, name, arguments }. Tool-level failures come back as an isError
      // flag on a 200 response (handleToolCall never throws for handler
      // errors) — the transport stays 2xx and the error travels in the body.
      if ((path === '/call' || path === '/invoke') && method === 'POST') {
        const body = await this.readJsonBody(req)
        if (!body) {
          sendJson(400, { error: 'Invalid JSON body' })
          return
        }

        const name = body.name
        if (typeof name !== 'string' || !name) {
          sendJson(400, { error: 'Missing required field: name' })
          return
        }

        const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
          ? (body.arguments as Record<string, unknown>)
          : {}

        const call: ToolCall = {
          id: typeof body.id === 'string' ? body.id : `http-${Date.now()}`,
          name,
          arguments: args,
        }

        const known = this.getToolList().some(t => t.name === name)
        if (!known) {
          sendJson(404, { error: `Unknown tool: ${name}` })
          return
        }

        const result = await this.handleToolCall(call)
        sendJson(200, result)
        return
      }

      if (path === '/call' || path === '/invoke' || path === '/' || path === '/tools') {
        sendJson(405, { error: `Method ${method} not allowed on ${path}` })
        return
      }

      sendJson(404, { error: `Not found: ${path}` })
    } catch (err) {
      // Stream/parse failures (e.g. a client aborting mid-body) must never
      // become an unhandled rejection or leave the client hanging.
      const message = err instanceof Error ? err.message : String(err)
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      }
    }
  }

  /** Read + parse a JSON request body, capped to 1 MiB. */
  private async readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown> | null> {
    const MAX_BYTES = 1024 * 1024
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BYTES) return null
      chunks.push(buf)
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
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
