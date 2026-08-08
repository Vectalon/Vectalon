import * as vscode from 'vscode'
import { McpHttpClient } from './client'
import type { HealthReport } from './client'
import { portFromUrl, spawnServer, isReachable, type ServerHandle } from './serverManager'
import { createGuardrailRunner, isCheckableFile } from './guardrails'
import { KnowledgeTreeProvider } from './knowledgeTree'
import { registerCommands } from './commands'
import { getOutputChannel, log, disposeOutputChannel } from './output'

let server: ServerHandle | null = null
let statusBar: vscode.StatusBarItem | null = null
let treeProvider: KnowledgeTreeProvider | null = null

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Vectalon extension activating')

  const config = vscode.workspace.getConfiguration('vectalon')
  const baseUrl = config.get<string>('url') || 'http://localhost:8765'
  const autoStart = config.get<boolean>('autoStart', true)
  const guardrailsOnSave = config.get<boolean>('guardrailsOnSave', true)

  const outputChannel = getOutputChannel()
  context.subscriptions.push(outputChannel)

  // Status bar: connection state + last guardrail summary.
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.text = '$(plug) Vectalon'
  statusBar.tooltip = 'Vectalon MCP server status. Click to start the server.'
  statusBar.command = 'vectalon.startServer'
  statusBar.show()
  context.subscriptions.push(statusBar)

  const diagnostics = vscode.languages.createDiagnosticCollection('vectalon-guardrails')
  context.subscriptions.push(diagnostics)

  const guardrails = createGuardrailRunner(new McpHttpClient(baseUrl), diagnostics)
  const tree = new KnowledgeTreeProvider(new McpHttpClient(baseUrl))
  treeProvider = tree
  context.subscriptions.push(
    vscode.window.createTreeView('vectalon.knowledgeView', { treeDataProvider: tree })
  )

  registerCommands(
    context,
    () => server?.client ?? null,
    guardrails,
    tree
  )

  // Start MCP server command (also the status-bar fallback).
  context.subscriptions.push(
    vscode.commands.registerCommand('vectalon.startServer', async () => {
      await connect(baseUrl, autoStart)
    }),
    vscode.commands.registerCommand('vectalon.stopServer', () => {
      disconnect()
    })
  )

  // Inline guardrail status: run on the active file when it changes / saves.
  if (guardrailsOnSave) {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isCheckableFile(editor.document.uri)) {
          void guardrails.run(editor.document.uri)
        }
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (isCheckableFile(document.uri)) {
          void guardrails.run(document.uri)
        }
      }),
      vscode.workspace.onDidCloseTextDocument(document => {
        guardrails.clear(document.uri)
      })
    )
  }

  // Connect at startup: reachable server wins; otherwise auto-start the CLI.
  await connect(baseUrl, autoStart)
  log('Vectalon extension activated')
}

async function connect(baseUrl: string, autoStart: boolean): Promise<void> {
  if (server) {
    updateStatus(true, '')
    return
  }
  updateStatus(false, 'connecting…')
  const probe = new McpHttpClient(baseUrl)
  if (await isReachable(probe)) {
    server = { client: probe, baseUrl, child: null, stop: () => undefined }
    onConnected()
    // Deep health (P0-4): surface healthy | degraded | critical + the failing
    // checks in the status-bar tooltip, best-effort. Guarded so a slow health
    // response can never flip the status bar back to "connected" after the
    // user has disconnected.
    void probe.getHealth().then((health: HealthReport | null) => {
      if (health && server?.client === probe) updateStatus(true, '', health)
    })
    return
  }
  if (!autoStart) {
    updateStatus(false, '')
    void vscode.window.showWarningMessage(
      `Vectalon server not reachable at ${baseUrl}. Run \`vectalon serve --protocol http\` or enable vectalon.autoStart.`
    )
    return
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
  try {
    updateStatus(false, 'starting…')
    server = await spawnServer(workspaceRoot, portFromUrl(baseUrl))
    onConnected()
  } catch (err) {
    server = null
    const message = err instanceof Error ? err.message : String(err)
    log(`Failed to start vectalon serve: ${message}`)
    void vscode.window.showWarningMessage(`Vectalon: could not start the MCP server — ${message}`)
  }
}

function disconnect(): void {
  server?.stop()
  server = null
  updateStatus(false, '')
  void vscode.window.showInformationMessage('Vectalon MCP server stopped')
}

function onConnected(): void {
  updateStatus(true, '')
  treeProvider?.refresh()
  void vscode.window.showInformationMessage(
    `Vectalon connected at ${server?.baseUrl || 'http://localhost'}`,
    'Open knowledge base'
  ).then(choice => {
    if (choice === 'Open knowledge base') {
      void vscode.commands.executeCommand('vectalon.knowledgeView.focus')
    }
  })
}

function updateStatus(connected: boolean, detail: string, health?: HealthReport | null): void {
  void vscode.commands.executeCommand('setContext', 'vectalon.connected', connected)
  if (!statusBar) return
  statusBar.text = connected ? '$(plug) Vectalon' : '$(plug) Vectalon (offline)'
  let tooltip = connected
    ? `Connected to ${server?.baseUrl || 'http://localhost'}`
    : `Vectalon MCP server is ${detail || 'offline'}. Click to start it.`
  if (connected && health) {
    tooltip += `\nHealth: ${health.status}`
    const failing = health.checks.filter(c => c.status !== 'ok')
    for (const check of failing.slice(0, 4)) {
      tooltip += `\n  ${check.status === 'fail' ? '✖' : '⚠'} ${check.name}: ${check.detail}`
    }
  }
  statusBar.tooltip = tooltip
  statusBar.command = connected ? 'vectalon.projectContext' : 'vectalon.startServer'
}

export function deactivate(): void {
  disconnect()
  disposeOutputChannel()
}
