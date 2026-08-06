/** Shared argument helpers for MCP tool handlers (moved out of MCPServer.ts). */

export function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(v => typeof v === 'string').map(v => (v as string).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  return []
}

export function parseTickets(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(v => typeof v === 'string') as string[]
  }
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.replace(/^[-*]\s*/, '').replace(/^[A-Za-z]+[-_]?\d+\s*[:.]\s*/, ''))
  }
  return []
}

export function extractComponentName(target: string): string {
  const base = (target.match(/[^/\\]+$/)?.[0] || target).replace(/\.(tsx?|jsx?)$/, '')
  return base || 'Component'
}
