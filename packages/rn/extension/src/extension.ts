import * as vscode from 'vscode'
import { McpHttpClient } from './client'
import type { HealthReport } from './client'
import { portFromUrl, spawnServerWithRetry, isReachable, type ServerHandle } from './serverManager'
import { createGuardrailRunner, isCheckableFile } from './guardrails'
import { KnowledgeTreeProvider } from './knowledgeTree'
import { registerCommands } from './commands'
import { getOutputChannel, log, disposeOutputChannel } from './output'
import { extensionCommandDecision } from './capabilityAvailability'

let server: ServerHandle | null = null
let statusBar: vscode.StatusBarItem | null = null
let treeProvider: KnowledgeTreeProvider | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let connecting = false

/** How often the background loop re-probes a dropped server (P0-8). */
const RECONNECT_INTERVAL_MS = 30_000

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

  const registerCapabilityCommand: typeof vscode.commands.registerCommand = (command, callback, thisArg) =>
    vscode.commands.registerCommand(command, async (...args: unknown[]) => {
      const experimental = vscode.workspace.getConfiguration('vectalon').get<boolean>('experimentalCapabilities', false)
      const decision = extensionCommandDecision(command, experimental)
      if (!decision.available) {
        void vscode.window.showWarningMessage(`Vectalon: ${command} unavailable (${decision.reason}). Experimental access does not grant paid entitlements.`)
        return
      }
      if (decision.warning) void vscode.window.showWarningMessage(decision.warning)
      return callback.apply(thisArg, args)
    })

  // Start / stop MCP server commands (also the status-bar fallback).
  context.subscriptions.push(
    registerCapabilityCommand('vectalon.startServer', async () => {
      await connect(baseUrl, autoStart)
    }),
    registerCapabilityCommand('vectalon.restartServer', async () => {
      await restartServer(baseUrl, autoStart)
    }),
    registerCapabilityCommand('vectalon.stopServer', () => {
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

  // Connect at startup: reachable server wins; otherwise auto-start the CLI
  // with retries. The background loop keeps the connection alive afterwards
  // (e.g. after laptop sleep).
  await connect(baseUrl, autoStart)
  startReconnectLoop(baseUrl, autoStart)
  log('Vectalon extension activated')
}

/**
 * Establish a connection. A reachable server wins; otherwise (autoStart) the
 * CLI is spawned with up to 3 attempts and exponential backoff. On total
 * failure an error notification offers Retry / Restart Server. Background
 * attempts (`silent`) log instead of notifying so the reconnect loop never
 * spams the user.
 */
async function connect(baseUrl: string, autoStart: boolean, silent = false): Promise<void> {
  if (server || connecting) return
  connecting = true
  try {
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
      if (!silent) {
        void vscode.window.showWarningMessage(
          `Vectalon server not reachable at ${baseUrl}. Run \`vectalon serve --protocol http\` or enable vectalon.autoStart.`
        )
      }
      return
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
    updateStatus(false, 'starting…')
    try {
      // P0-8: 3 spawn attempts with exponential backoff (1s, 2s) instead of a
      // single 20s try-and-give-up.
      server = await spawnServerWithRetry(workspaceRoot, portFromUrl(baseUrl))
      onConnected()
    } catch (err) {
      server = null
      const message = err instanceof Error ? err.message : String(err)
      log(`Failed to start vectalon serve: ${message}`)
      if (silent) {
        updateStatus(false, 'offline (reconnect pending)')
        return
      }
      // Release the lock before the notification resolves so the Retry /
      // Restart Server actions actually run instead of bouncing off the
      // `connecting` guard (the finally below is too late for them).
      connecting = false
      const action = await vscode.window.showErrorMessage(
        `Vectalon: could not start the MCP server — ${message}`,
        'Retry',
        'Restart Server'
      )
      if (action === 'Retry') {
        await connect(baseUrl, autoStart)
      } else if (action === 'Restart Server') {
        await restartServer(baseUrl, autoStart)
      }
    }
  } finally {
    connecting = false
  }
}

/** Kill any child process and re-establish the connection. */
async function restartServer(baseUrl: string, autoStart: boolean): Promise<void> {
  if (server) {
    server.stop()
    server = null
  }
  updateStatus(false, 'restarting…')
  await connect(baseUrl, autoStart)
}

/**
 * Background reconnect loop (P0-8): every 30s, if the server is unreachable
 * (dropped, laptop sleep, port taken over), attempt a silent reconnect. Stops
 * when the user explicitly stops the server or the extension deactivates.
 */
function startReconnectLoop(baseUrl: string, autoStart: boolean): void {
  if (reconnectTimer) return
  reconnectTimer = setInterval(() => {
    void (async () => {
      if (connecting) return
      // Re-read the config each tick so url/autoStart changes take effect
      // without a window reload.
      const config = vscode.workspace.getConfiguration('vectalon')
      const liveBaseUrl = config.get<string>('url') || baseUrl
      const liveAutoStart = config.get<boolean>('autoStart', autoStart)
      if (server) {
        const alive = await server.client.pingQuick(3_000)
        if (alive) return
        log('Vectalon server dropped (sleep/wake or process exit) — reconnecting')
        server.stop()
        server = null
      }
      await connect(liveBaseUrl, liveAutoStart, true)
    })()
  }, RECONNECT_INTERVAL_MS)
}

function stopReconnectLoop(): void {
  if (reconnectTimer) {
    clearInterval(reconnectTimer)
    reconnectTimer = null
  }
}

function disconnect(): void {
  stopReconnectLoop()
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
  stopReconnectLoop()
  disconnect()
  disposeOutputChannel()
}
