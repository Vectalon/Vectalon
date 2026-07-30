export { Scanner, ContextEngine } from './harness'
export type { ProjectInfo, FileNode, ComponentInfo, ContextSnapshot } from './harness'

export { ModelRouter } from './model'
export type { ModelConfig, ModelRequest, ModelResponse, ModelProviderType } from './model'

export { MCPServer } from './protocol'
export type { AgentTool, ToolCall, ToolResult, ProtocolType } from './protocol'

export { ComponentGenerator, TestWriter, DebugAnalyzer, LintFixer } from './sdlc'

export { PatternLearner, ProjectMemory } from './memory'
export type { Pattern, PatternStore } from './memory'

export { getConfig, setConfig } from './config'
