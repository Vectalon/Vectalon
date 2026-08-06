import type { ContextEngine } from '../../harness/ContextEngine'
import type { ModelRouter } from '../../model/ModelRouter'
import type { ArtifactStore } from '../../knowledge/ArtifactStore'
import type { TeamStore } from '../../knowledge/TeamStore'
import type { AgentTool, ToolCall, ToolResult } from '../types'

/**
 * The shared services a tool registry needs. The server builds this once and
 * hands it to every registry, so registries stay free of transport/lifecycle
 * concerns (those remain on MCPServer).
 */
export interface ToolContext {
  engine: ContextEngine
  modelRouter: ModelRouter
  artifactStore: ArtifactStore | null
  teamStore: TeamStore | null
  /** When true, device-control tools execute real simulator/emulator commands. */
  deviceControlLive: boolean
  /** Execute any tool call (used by run_agent to drive its tool loop). */
  handleToolCall: (call: ToolCall) => Promise<ToolResult>
  /** Full advertised tool list, including proxied sub-MCP tools (run_agent). */
  getToolList: () => AgentTool[]
}
