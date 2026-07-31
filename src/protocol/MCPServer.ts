import type { AgentTool, ToolCall, ToolResult, ProtocolType } from './types'
import { ContextEngine } from '../harness/ContextEngine'
import { ModelRouter } from '../model/ModelRouter'

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

  constructor(engine: ContextEngine, modelRouter: ModelRouter, protocol: ProtocolType = 'mcp') {
    this.engine = engine
    this.modelRouter = modelRouter
    this.protocol = protocol
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
        description: 'Write a test file for a given component or module',
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            framework: { type: 'string', enum: ['jest', 'detox'] },
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

      const response = await this.modelRouter.generate({
        prompt: `Write ${framework} tests for: ${target}`,
        systemPrompt: 'You are a testing expert for React Native. Generate comprehensive tests.',
        temperature: 0.2,
      })

      return response.content
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
