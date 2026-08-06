import * as vscode from 'vscode'
import { McpHttpClient } from './client'
import { PreviewPanel } from './webview'
import { log } from './output'

interface ArtifactSummary {
  id: string
  type: string
  title: string
  status?: string
  version?: number
  updatedAt?: string
}

/**
 * Sidebar tree of the team knowledge base: artifact types as parent nodes,
 * artifacts as children. Clicking an artifact fetches its full content and
 * renders it in the preview panel.
 */
export class KnowledgeTreeProvider implements vscode.TreeDataProvider<KnowledgeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KnowledgeNode | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private artifacts: ArtifactSummary[] = []
  private loading = false

  constructor(private client: McpHttpClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: KnowledgeNode): vscode.TreeItem {
    return element
  }

  async getChildren(element?: KnowledgeNode): Promise<KnowledgeNode[]> {
    if (!element) {
      // Root: fetch once, group by artifact type.
      await this.loadArtifacts()
      const byType = new Map<string, ArtifactSummary[]>()
      for (const artifact of this.artifacts) {
        const list = byType.get(artifact.type) || []
        list.push(artifact)
        byType.set(artifact.type, list)
      }
      return [...byType.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([type, items]) => groupNode(type, items))
    }
    return element.children || []
  }

  private async loadArtifacts(): Promise<void> {
    if (this.loading) return
    this.loading = true
    try {
      const raw = await this.client.callTool('list_artifacts')
      const parsed = JSON.parse(raw.content) as ArtifactSummary[]
      if (Array.isArray(parsed)) {
        this.artifacts = parsed
      }
    } catch (err) {
      this.artifacts = []
      log(`list_artifacts failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      this.loading = false
    }
  }
}

export class KnowledgeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'group' | 'artifact',
    public readonly artifact: ArtifactSummary | null,
    public readonly children: KnowledgeNode[] = []
  ) {
    super(label, children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None)
    if (kind === 'artifact') {
      this.iconPath = new vscode.ThemeIcon('file-text')
      this.tooltip = artifact ? `${artifact.title}\n(${artifact.type})` : label
      this.command = {
        command: 'vectalon.openArtifact',
        title: 'Open artifact',
        arguments: [artifact],
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('library')
      this.tooltip = `${children.length} artifact(s)`
    }
  }
}

function groupNode(type: string, items: ArtifactSummary[]): KnowledgeNode {
  const children = items
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map(item => new KnowledgeNode(item.title, 'artifact', item))
  return new KnowledgeNode(type, 'group', null, children)
}

/** Open an artifact's full content in the preview panel. */
export async function openArtifact(
  client: McpHttpClient,
  artifact: { id: string; title?: string } | null
): Promise<void> {
  if (!artifact) return
  const raw = await client.callTool('get_artifact', { id: artifact.id })
  let content = raw.content
  try {
    const parsed = JSON.parse(raw.content) as { content?: string; title?: string }
    content = parsed.content || raw.content
  } catch {
    // Raw content is already the display text.
  }
  PreviewPanel.show(artifact.title || 'Artifact', content)
}
