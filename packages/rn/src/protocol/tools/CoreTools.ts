import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { extractComponentName } from './shared'
import { runAgentLoop } from '../../model/toolCalling'
import { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState } from '../../workflows'
import { createAdapters } from '../../adapters'
import { TestCaseWriter } from '../../sdlc/TestCaseWriter'
import { runGuardrails, RULE_CRASH_MESSAGE } from '../../guardrails'
import { analyzeCrossPackageImpact, renderImpactReport } from '../../harness'
import type { GuardrailConventions } from '../../guardrails'
import { safe } from '../../utils/safe'

const LATEST_KNOWN: Record<string, string> = {
  'react-native': '0.74.0',
  react: '18.3.1',
  typescript: '5.5.0',
  jest: '29.7.0',
  '@react-navigation/native': '6.1.0',
}

/**
 * Structured markdown summary for a run_agent loop: the answer, an
 * executed/skipped counts line, and a per-call table with ✓/⚠ marks. The
 * table keeps the model's own output intact while making the tool usage
 * (what actually ran, what was skipped as a repeat) legible to the caller.
 */
export function renderAgentResult(result: {
  answer: string
  iterations: number
  calls: Array<{ tool: string; result: string; skipped?: boolean }>
}): string {
  const executed = result.calls.filter(c => !c.skipped).length
  const skipped = result.calls.length - executed
  const calls = result.calls.map((c, i) => {
    const mark = c.skipped ? '⚠️' : '✅'
    const status = c.skipped ? 'skipped (repeat)' : 'executed'
    const snippet = c.result
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 120)
    return `| ${i + 1} | \`${c.tool}\` | ${mark} ${status} | ${snippet} |`
  }).join('\n')
  return [
    '## Agent result',
    '',
    result.answer,
    '',
    `_Tool calls: ${executed} executed · ${skipped} skipped · ${result.iterations} iteration(s)_`,
    ...(result.calls.length > 0
      ? ['', '| # | Tool | Status | Result (truncated) |', '|---|---|---|---|', calls]
      : []),
  ].join('\n')
}

/**
 * Core harness tools — project context, patterns, model generation, guardrails,
 * the agent loop, and workflow execution.
 */
export class CoreTools extends ToolRegistry {
  @mcpTool('get_project_context', 'Get the full project context including structure, components, and patterns', {
    type: 'object',
    properties: {},
  })
  async getProjectContext(): Promise<string> {
    const snapshot = this.ctx.engine.getSnapshot()
    if (!snapshot) return 'No snapshot available. Run `rn-vectalon init` first.'
    return this.ctx.engine.buildContextPrompt()
  }

  @mcpTool('get_learned_patterns', 'View patterns the harness has learned about this project', {
    type: 'object',
    properties: {},
  })
  async getLearnedPatterns(): Promise<string> {
    const store = this.ctx.engine.getPatternStore()
    if (!store) return 'No learned patterns available.'
    return JSON.stringify(store.getActivePatterns(), null, 2)
  }

  @mcpTool('run_agent', 'Run the local model as an agent over the SDK tools: it can call any listed tool (including proxied MCP tools) and returns a final answer', {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
    },
    required: ['prompt'],
  })
  async runAgent(args: Record<string, unknown>): Promise<string> {
    const prompt = (args.prompt as string) || ''
    if (!prompt) return 'Missing prompt'

    // Exclude run_agent itself so the loop can't recursively spawn nested
    // agent loops (bounded nesting would still multiply model calls).
    const tools = this.ctx.getToolList()
      .filter(t => t.name !== 'run_agent')
      .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
    const snapshot = this.ctx.engine.getSnapshot()
    const result = await runAgentLoop({
      modelRouter: this.ctx.modelRouter,
      prompt,
      tools,
      context: snapshot ? this.ctx.engine.buildContextPrompt() : undefined,
      execute: async (name, toolArgs) => {
        const toolResult = await this.ctx.handleToolCall({
          id: `agent-${Date.now()}`,
          name,
          arguments: toolArgs || {},
        })
        return toolResult.isError ? `Error: ${toolResult.content}` : toolResult.content
      },
    })

    return renderAgentResult(result)
  }

  @mcpTool('execute_workflow', 'Run a named SDLC workflow end-to-end for a given prompt (e.g. feature-development)', {
    type: 'object',
    properties: {
      workflowId: { type: 'string', enum: ['feature-development'] },
      prompt: { type: 'string' },
    },
    required: ['workflowId', 'prompt'],
  })
  async executeWorkflow(args: Record<string, unknown>): Promise<string> {
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
      snapshot: this.ctx.engine.getSnapshot(),
      prompt,
      inputs: {},
      outputs: {},
      state,
      adapters: createAdapters({ dryRun: true }),
      modelRouter: this.ctx.modelRouter,
    })

    return JSON.stringify(result, null, 2)
  }

  @mcpTool('suggest_dependency_update', 'Suggest dependency updates based on project config', {
    type: 'object',
    properties: {
      packageName: { type: 'string' },
    },
  })
  async suggestDependencyUpdate(args: Record<string, unknown>): Promise<string> {
    const packageName = (args.packageName as string) || ''
    const snapshot = this.ctx.engine.getSnapshot()
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
  }

  @mcpTool('analyze_impact', 'Compute the cross-package blast radius of changed files in a monorepo: which workspace packages consume them, which screens re-render, which navigation stacks are affected, and which Maestro E2E flows must run. Pass comma-separated changed file paths (relative to the workspace root)', {
    type: 'object',
    properties: {
      changedFiles: { type: 'string' },
    },
    required: ['changedFiles'],
  })
  async analyzeImpact(args: Record<string, unknown>): Promise<string> {
    const changed = ((args.changedFiles as string) || '')
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean)
    if (changed.length === 0) {
      return 'Pass `changedFiles` — a comma-separated list of changed paths relative to the workspace root (e.g. "packages/ui/src/Button.tsx").'
    }
    const root = this.ctx.engine.getSnapshot()?.project.root || process.cwd()
    const impact = analyzeCrossPackageImpact(root, changed)
    const content = renderImpactReport(impact)
    this.persistArtifact('engineering', `Cross-package impact: ${changed.join(', ')}`, content)
    return content
  }

  @mcpTool('analyze_error', 'Analyze a build or runtime error and provide fixes', {
    type: 'object',
    properties: {
      error: { type: 'string' },
      context: { type: 'string' },
    },
    required: ['error'],
  })
  async analyzeError(args: Record<string, unknown>): Promise<string> {
    const error = args.error as string
    const context = (args.context as string) || ''

    const snapshot = this.ctx.engine.getSnapshot()
    const projectContext = snapshot ? this.ctx.engine.buildContextPrompt() : ''

    const response = await this.ctx.modelRouter.generate({
      prompt: `Analyze this React Native error and provide a fix:\n\n${error}`,
      context: context || projectContext,
      systemPrompt: 'You are a React Native debugging expert. Analyze the error and suggest specific fixes.',
      temperature: 0.2,
    })

    return response.content
  }

  @mcpTool('generate_component', 'Generate a new React Native component following project conventions', {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['functional'] },
      usesNavigation: { type: 'boolean' },
      usesStyleSheet: { type: 'boolean' },
    },
    required: ['name'],
  })
  async generateComponent(args: Record<string, unknown>): Promise<string> {
    const name = args.name as string
    const type = (args.type as string) || 'functional'

    const snapshot = this.ctx.engine.getSnapshot()
    const projectContext = snapshot ? this.ctx.engine.buildContextPrompt() : ''

    const response = await this.ctx.modelRouter.generate({
      prompt: `Generate a React Native ${type} component named "${name}".`,
      context: projectContext,
      systemPrompt: 'You are an expert React Native developer. Generate clean, well-structured components.',
      temperature: 0.3,
    })

    return response.content
  }

  @mcpTool('check_guardrails', 'Run the project guardrail rule set over a code snippet and report pass/fail findings with line numbers (JSON)', {
    type: 'object',
    properties: {
      content: { type: 'string' },
      filePath: { type: 'string' },
    },
    required: ['content'],
  })
  async checkGuardrails(args: Record<string, unknown>): Promise<string> {
    const content = (args.content as string) || ''
    const filePath = (args.filePath as string) || 'snippet.tsx'
    if (!content) return 'Missing required field: content'
    // P0-9: the run is wrapped in safe() and every rule already degrades
    // per-rule — a corrupted file emits one clear diagnostic instead of
    // crashing the guardrail run (or the extension host calling it on save).
    const result = safe(
      () => runGuardrails({ filePath, content, conventions: this.conventionsFromSnapshot() }),
      'check_guardrails'
    )
    if (!result.ok) {
      return JSON.stringify({
        filePath,
        passed: 0,
        failed: 1,
        skipped: 0,
        ok: false,
        findings: [
          {
            rule: 'parse',
            severity: 'warning',
            passed: false,
            message: `${RULE_CRASH_MESSAGE} (${result.error.message})`,
            line: 1,
          },
        ],
      }, null, 2)
    }
    return JSON.stringify(result.value, null, 2)
  }

  @mcpTool('write_test', 'Write a test file for a given component or module; pass acceptance criteria for deterministic cases', {
    type: 'object',
    properties: {
      target: { type: 'string' },
      framework: { type: 'string', enum: ['jest', 'detox'] },
      acceptanceCriteria: { type: 'string' },
    },
    required: ['target'],
  })
  async writeTest(args: Record<string, unknown>): Promise<string> {
    const target = args.target as string
    const framework = (args.framework as string) || 'jest'
    const acceptanceCriteria = (args.acceptanceCriteria as string) || ''

    if (acceptanceCriteria) {
      const component = extractComponentName(target)
      const content = new TestCaseWriter().writeTestCases(acceptanceCriteria, component)
      this.persistArtifact('qa', `Test Cases: ${target}`, content)
      return content
    }

    const response = await this.ctx.modelRouter.generate({
      prompt: `Write ${framework} tests for: ${target}`,
      systemPrompt: 'You are a testing expert for React Native. Generate comprehensive tests.',
      temperature: 0.2,
    })

    return response.content
  }

  /** Project conventions for guardrail checks, derived from the scan snapshot. */
  private conventionsFromSnapshot(): GuardrailConventions {
    const snapshot = this.ctx.engine.getSnapshot()
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
}
