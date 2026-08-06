/**
 * Decorator-based MCP tool registration.
 *
 * Domain tool registries (CoreTools, SdlcTools, KnowledgeTools, EcosystemTools)
 * declare their tools once with `@mcpTool(name, description, inputSchema?)` on a
 * class method, and the server derives BOTH the callable handler map and the
 * discovery list from that single declaration — no more list/handler drift in
 * one 1,600-line file.
 *
 * A tool may opt into gating with `requires: 'artifactStore' | 'teamStore'`;
 * the server registers (and advertises) it only when the matching service is
 * present on the context.
 *
 * The decorator is a legacy TS method decorator (needs `experimentalDecorators`
 * in tsconfig), collecting metadata onto the declaring class constructor so
 * each registry keeps its own tool set even with a shared base class.
 */

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  /** Only register/advertise when the server context provides this service. */
  requires?: 'artifactStore' | 'teamStore'
}

export type McpToolHandler = (args: Record<string, unknown>) => Promise<string>

export interface RegisteredTool extends McpToolDefinition {
  /** Instance-bound handler (this = the registry instance). */
  handler: McpToolHandler
}

const MCP_TOOLS = Symbol('vectalon.mcpTools')

interface DecoratedEntry {
  definition: McpToolDefinition
  descriptor: PropertyDescriptor
}

type ToolCtor = { [MCP_TOOLS]?: DecoratedEntry[] }

/**
 * Declare a class method as an MCP tool. Usage:
 *
 *   @mcpTool('write_prd', 'Write a PRD scaffold', { ...inputSchema... })
 *   async writePrd(args: Record<string, unknown>): Promise<string> { ... }
 */
export function mcpTool(
  name: string,
  description: string,
  inputSchema?: Record<string, unknown>,
  requires?: McpToolDefinition['requires']
): MethodDecorator {
  return (target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): void => {
    const ctor = target.constructor as ToolCtor
    const entries = ctor[MCP_TOOLS] || (ctor[MCP_TOOLS] = [])
    entries.push({ definition: { name, description, inputSchema, requires }, descriptor })
  }
}

/** All tools declared on `instance`'s class, with handlers bound to it. */
export function collectTools(instance: object): RegisteredTool[] {
  const ctor = instance.constructor as ToolCtor
  const entries = ctor[MCP_TOOLS] || []
  return entries.map(entry => {
    const method = entry.descriptor.value as (args: Record<string, unknown>) => Promise<string>
    return {
      ...entry.definition,
      handler: (args: Record<string, unknown>) => method.call(instance, args),
    }
  })
}
