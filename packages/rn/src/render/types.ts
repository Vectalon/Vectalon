/**
 * Metro-aware execution sandbox — types
 * Business Source License 1.1 (BSL-1.1)
 *
 * I-4: compile generated files through the Metro transform pipeline (Babel
 * presets, TypeScript offline fallback), then hot-render them headlessly
 * inside the V-1 sandbox — reading console logs, render output, and runtime
 * errors before any diff is presented. Agents become self-correcting on
 * JSX/TS errors instead of merely lint-aware.
 */

export interface RenderFile {
  /** Project-relative path, e.g. `src/components/Button.tsx`. */
  path: string
  content: string
}

/** How the source was transpiled. */
export type TranspilerKind = 'babel' | 'typescript' | 'parser' | 'none'

/** How the component was rendered. */
export type RendererKind = 'shim' | 'react-test-renderer' | 'none'

export interface CompiledFile {
  path: string
  ok: boolean
  /** Transpile error (syntax / JSX / TS) when `ok` is false. */
  error?: string
}

export interface RenderNode {
  type: string
  key: string | null
  props: Record<string, unknown>
  children: RenderNode[] | string[]
}

export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  message: string
}

export interface RenderResult {
  ok: boolean
  transpiler: TranspilerKind
  renderer: RendererKind
  /** Per-file transpile status; entry failures surface here. */
  compiled: CompiledFile[]
  /** The entry file that was rendered. */
  entry: string
  /** Console output captured during render (logs, warnings, errors). */
  logs: ConsoleLogEntry[]
  /** The headless render tree (null when load/render failed). */
  tree: RenderNode | null
  /** Module-load error (missing dependency, bad export, throw at import). */
  loadError?: string
  /** Runtime error thrown while rendering the component. */
  runtimeError?: string
  durationMs: number
  isolation: string
  droppedEnv: string[]
  /** Compile-only diagnostics when a transpiler could not be resolved. */
  warning?: string
}

export interface RenderOptions {
  /** Source files to compile + render (entry included). */
  files: RenderFile[]
  /** The file (from `files`) to load and render, e.g. `src/App.tsx`. */
  entry: string
  /** Wall-clock timeout in ms (default 30s). */
  timeoutMs?: number
  /** Virtual memory limit in MB. */
  memoryMb?: number
  /**
   * Extra ambient env var names to keep (deny-by-default otherwise).
   * Rarely needed — rendering is hermetic.
   */
  allowEnv?: string[]
  /**
   * Directory to resolve the project's own Babel toolchain from (Metro's
   * pipeline). When omitted, the offline TypeScript transpiler is used.
   */
  projectRoot?: string
}
