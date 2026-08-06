/**
 * Vectalon RN — MCP protocol and server
 * Business Source License 1.1 (BSL-1.1)
 */

export { MCPServer } from './MCPServer'
export {
  SubMcpClient,
  spawnMcpProcess,
  spawnClientForItem,
  startEnabledMcpClients,
  parseMcpCommand,
  renderMcpContent,
} from './subMcp'
export type {
  McpTransport,
  McpToolDef,
  McpServerInfo,
  McpCallResult,
  McpClientHandle,
  SubMcpClientOptions,
  StartMcpClientsOptions,
} from './subMcp'
export type { AgentTool, ToolCall, ToolResult, ProtocolType } from './types'
