import * as vscode from 'vscode'
import { McpHttpClient } from './client'
import { PreviewPanel } from './webview'
import { openArtifact, type KnowledgeTreeProvider } from './knowledgeTree'
import type { GuardrailRunner } from './guardrails'
import { log } from './output'

/** Register every Vectalon command palette workflow. */
export function registerCommands(
  context: vscode.ExtensionContext,
  getClient: () => McpHttpClient | null,
  guardrails: GuardrailRunner,
  knowledgeTree: KnowledgeTreeProvider
): void {
  const requireClient = (): McpHttpClient | null => {
    const client = getClient()
    if (!client) {
      void vscode.window.showWarningMessage('Vectalon server is not connected. Run "Vectalon: Start MCP Server".')
    }
    return client
  }

  const withClient = async (fn: (client: McpHttpClient) => Promise<void>): Promise<void> => {
    const client = requireClient()
    if (!client) return
    try {
      await fn(client)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log(`Command failed: ${message}`)
      void vscode.window.showErrorMessage(`Vectalon: ${message}`)
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('vectalon.runFeatureWorkflow', () =>
      withClient(async client => {
        const prompt = await vscode.window.showInputBox({
          prompt: 'Describe the feature to build',
          placeHolder: 'e.g. Add a login screen with email + password',
        })
        if (!prompt) return
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Vectalon: running feature workflow…' },
          async () => {
            const result = await client.callTool('execute_workflow', {
              workflowId: 'feature-development',
              prompt,
            })
            PreviewPanel.show('Feature Workflow', result.content)
          }
        )
      })
    ),

    vscode.commands.registerCommand('vectalon.reviewCode', () =>
      withClient(async client => {
        const editor = vscode.window.activeTextEditor
        if (!editor) return
        const result = await client.callTool('review_code', {
          code: editor.document.getText(),
          language: editor.document.languageId,
          filename: editor.document.fileName,
        })
        PreviewPanel.show('Code Review', result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.checkGuardrails', () =>
      withClient(async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) return
        await guardrails.run(editor.document.uri)
        void vscode.window.showInformationMessage(`Vectalon: ${guardrails.lastSummary()}`)
      })
    ),

    vscode.commands.registerCommand('vectalon.generateComponent', () =>
      withClient(async client => {
        const name = await vscode.window.showInputBox({
          prompt: 'Component name (PascalCase)',
          placeHolder: 'e.g. ProfileCard',
        })
        if (!name) return
        const result = await client.callTool('generate_component', { name })
        PreviewPanel.show(name, result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.archiveBuild', () =>
      withClient(async client => {
        const flavor = await vscode.window.showInputBox({
          prompt: 'Build flavor (leave empty for auto-detect)',
          placeHolder: 'e.g. staging',
        })
        if (flavor === undefined) return
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Vectalon: archiving build…' },
          async () => {
            const result = await client.callTool('archive_build', { flavor: flavor || undefined })
            PreviewPanel.show('Archive Build', result.content)
          }
        )
      })
    ),

    vscode.commands.registerCommand('vectalon.distributeBuild', () =>
      withClient(async client => {
        const target = await vscode.window.showQuickPick(['testflight', 'play-store', 'saas', 'portal'], {
          placeHolder: 'Distribution target (dry-run plan by default)',
        })
        if (!target) return
        const result = await client.callTool('distribute_build', { target })
        PreviewPanel.show(`Distribute → ${target}`, result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.shareBuild', () =>
      withClient(async client => {
        const result = await client.callTool('share_build_locally', {})
        PreviewPanel.show('Share Build', result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.generatePortal', () =>
      withClient(async client => {
        const branding = await vscode.window.showInputBox({
          prompt: 'Portal branding (title)',
          placeHolder: 'e.g. Acme Builds',
        })
        const result = await client.callTool('generate_portal', { branding: branding || undefined })
        PreviewPanel.show('Build Portal', result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.projectContext', () =>
      withClient(async client => {
        const result = await client.callTool('get_project_context')
        PreviewPanel.show('Project Context', result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.searchKnowledge', () =>
      withClient(async client => {
        const query = await vscode.window.showInputBox({
          prompt: 'Search the team knowledge base',
          placeHolder: 'e.g. navigation patterns',
        })
        if (!query) return
        const result = await client.callTool('search_knowledge', { query })
        PreviewPanel.show(`Search: ${query}`, result.content)
      })
    ),

    vscode.commands.registerCommand('vectalon.refreshKnowledge', () => {
      knowledgeTree.refresh()
    }),

    vscode.commands.registerCommand(
      'vectalon.openArtifact',
      (artifact: { id: string; title?: string; type?: string; status?: string; version?: number; updatedAt?: string } | null) =>
        withClient(async client => {
          await openArtifact(client, artifact)
        })
    )
  )
}
