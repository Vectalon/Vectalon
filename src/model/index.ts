export { ModelRouter } from './ModelRouter'
export { WasmProvider } from './providers/WasmProvider'
export type { WasmProviderOptions } from './providers/WasmProvider'
export { wasmZeroConfigEnabled } from './zeroConfig'
export { getWasmPreset, wasmDtype, wasmCacheDir, wasmCacheReady, WASM_MODEL_PRESETS } from './local/wasmPresets'
export type { WasmModelPreset } from './local/wasmPresets'
export { TOOL_CALL_SCHEMA, buildToolCallSystemPrompt, parseToolCallOutput, runAgentLoop } from './toolCalling'
export type {
  ModelConfig,
  ModelRequest,
  ModelResponse,
  ModelProviderType,
  ToolDefinition,
} from './types'
export type {
  ParsedToolCall,
  AgentLoopOptions,
  AgentLoopCall,
  AgentLoopResult,
} from './toolCalling'
