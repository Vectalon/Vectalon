/**
 * Metro-aware execution sandbox (I-4)
 * Business Source License 1.1 (BSL-1.1)
 *
 * The flagship "agent that ships" capability: compile generated files through
 * the Metro transform pipeline (Babel presets from the project, offline
 * TypeScript fallback), render them headlessly inside the V-1 sandbox, and
 * read console logs, render output, and runtime errors before a diff is ever
 * presented — so agents self-correct on JSX/TS errors instead of only being
 * lint-aware.
 */

export { renderInSandbox, extractRelativeRequires, resolveRelativeFile } from './run'
export { compileSource, resolveProjectBabel } from './compile'
export { buildHarnessScript, buildShimFile, RENDER_MARKER } from './harness'
export { SHIM_SOURCE } from './shim'
export { renderRenderResult, stringifyRenderTree } from './report'
export type { RenderFile, RenderOptions, RenderResult, RenderNode, ConsoleLogEntry, CompiledFile, TranspilerKind, RendererKind } from './types'
