export type AgentTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ToolResult = {
  id: string
  content: string
  isError?: boolean
}

export type ProtocolType = 'mcp' | 'stdio' | 'sse' | 'http'
