/**
 * RenderTools — MCP tools for the Metro-aware execution sandbox
 * Business Source License 1.1 (BSL-1.1)
 *
 * `render_component` compiles generated TS/TSX (project Babel → offline
 * TypeScript) and headlessly renders the entry inside the V-1 sandbox —
 * returning console logs, the render tree, and any load/runtime errors. This
 * is the "self-correcting" loop: an agent can render, see the error, fix the
 * file, and re-render before presenting a diff.
 */

import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { renderInSandbox } from '../../render'

const SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Map of sandbox-relative path → source content, e.g. { "src/App.tsx": "…" }. The entry must be one of these keys.',
    },
    entry: { type: 'string', description: 'The file to load + render, e.g. src/App.tsx (must be a key of files)' },
    timeoutMs: { type: 'number', description: 'Wall-clock timeout in ms (default 30000)' },
    memoryMb: { type: 'number', description: 'Virtual memory limit in MB' },
    projectRoot: { type: 'string', description: 'Optional project root to resolve the project Babel/Metro toolchain from' },
  },
  required: ['files', 'entry'],
}

export class RenderTools extends ToolRegistry {
  @mcpTool(
    'render_component',
    'Compile generated TS/TSX through the Metro transform pipeline (project Babel or offline TypeScript) and headlessly render the entry inside the isolated sandbox — returning console logs, the render tree, and any load/runtime errors. Use this to verify generated components actually compile and render before presenting a diff to the user. Deterministic, offline, no network.',
    SCHEMA
  )
  async renderComponentTool(args: Record<string, unknown>): Promise<string> {
    const rawFiles = args.files
    if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) {
      throw new Error('render_component requires `files` as an object map of path → content')
    }
    const entry = args.entry
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error('render_component requires an `entry` file key')
    }
    const files = Object.entries(rawFiles as Record<string, unknown>).map(([path, content]) => ({
      path,
      content: typeof content === 'string' ? content : String(content ?? ''),
    }))
    if (!files.some(f => f.path === entry)) {
      throw new Error(`render_component: entry "${entry}" is not a key of files`)
    }
    const num = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
      return undefined
    }
    const projectRoot = typeof args.projectRoot === 'string' && args.projectRoot.trim() ? args.projectRoot.trim() : undefined
    const result = await renderInSandbox({
      files,
      entry,
      projectRoot,
      timeoutMs: num(args.timeoutMs),
      memoryMb: num(args.memoryMb),
    })
    return JSON.stringify(result, null, 2)
  }
}
