import { reportError } from '../../utils/safe'
import type { Artifact, ArtifactType } from '../../knowledge/artifactTypes'
import { collectTools, type McpToolDefinition, type RegisteredTool } from './decorators'
import type { ToolContext } from './context'

/**
 * Base class for per-domain tool registries. Subclasses declare tools with the
 * `@mcpTool` decorator and share the services/helpers below; `tools()` and
 * `metadata()` are derived from the decorator declarations.
 */
export abstract class ToolRegistry {
  constructor(protected readonly ctx: ToolContext) {}

  /** All decorated tools on this registry, handlers bound to this instance. */
  tools(): RegisteredTool[] {
    return collectTools(this)
  }

  /** Decorator metadata only (no handlers) for discovery lists. */
  metadata(): McpToolDefinition[] {
    return collectTools(this).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      requires: t.requires,
    }))
  }

  /** Persist an artifact when a knowledge store is attached; no-op otherwise. */
  protected persistArtifact(
    type: ArtifactType,
    title: string,
    content: string,
    parentId?: unknown
  ): Artifact | null {
    const store = this.ctx.artifactStore
    if (!store) return null
    const artifact = store.add({ type, title, content, source: 'generated' })
    if (parentId && store.get(String(parentId))) {
      store.link(String(parentId), artifact.id)
    }
    return artifact
  }

  /** Model-assisted expansion of a scaffold; falls back to the scaffold. */
  protected async maybeEnhance(
    args: Record<string, unknown>,
    scaffold: string,
    systemPrompt: string
  ): Promise<string> {
    if (args.enhance !== true) return scaffold
    try {
      const response = await this.ctx.modelRouter.generate({
        prompt: `Expand the following scaffold into a complete document:\n\n${scaffold}`,
        systemPrompt,
        temperature: 0.3,
      })
      return response.content
    } catch (err) {
      reportError(err, 'MCPServer: LLM document expansion failed', 'warn')
      return scaffold
    }
  }
}
