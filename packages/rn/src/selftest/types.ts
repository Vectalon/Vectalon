/**
 * Vectalon RN — Feature self-test types
 * Business Source License 1.1 (BSL-1.1)
 *
 * The self-test suite exercises every feature of the harness in a sandboxed,
 * deterministic, offline way and produces a visible report (terminal + HTML
 * dashboard) plus an activity trace that shows clients exactly what the
 * package did: which steps ran, which shell commands were executed, and which
 * files were created or modified.
 */

export type SelfTestCategory =
  | 'cli'
  | 'sdlc'
  | 'guardrails'
  | 'knowledge'
  | 'harness'
  | 'model'
  | 'mcp'
  | 'workflows'
  | 'ecosystem'
  | 'bench'
  | 'adapters'
  | 'memory'
  | 'upgrade'
  | 'perf'
  | 'sandbox'
  | 'render'
  | 'diagnostics'

export const SELF_TEST_CATEGORIES: SelfTestCategory[] = [
  'cli',
  'sdlc',
  'guardrails',
  'knowledge',
  'harness',
  'model',
  'mcp',
  'workflows',
  'ecosystem',
  'bench',
  'adapters',
  'memory',
  'upgrade',
  'perf',
  'sandbox',
  'render',
  'diagnostics',
]

export type CheckStatus = 'pass' | 'fail' | 'warn'

export type TraceStepKind = 'step' | 'command' | 'write' | 'artifact' | 'warn'

export interface TraceCommand {
  command: string
  args: string[]
  cwd: string
  exitCode?: number
}

export interface TraceWrite {
  /** Path relative to the sandbox root. */
  path: string
  bytes?: number
}

export interface TraceArtifact {
  /** Path relative to the sandbox root. */
  path: string
  summary?: string
}

export interface TraceStep {
  kind: TraceStepKind
  message: string
  command?: TraceCommand
  write?: TraceWrite
  artifact?: TraceArtifact
}

export interface CommandResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export type ModelProviderChoice =
  | 'local'
  | 'wasm'
  | 'openai'
  | 'anthropic'
  | 'azure-openai'
  | 'ollama'
  | 'vllm'
  | 'groq'

export interface SelfTestContext {
  /** Isolated temp directory for this check — cleaned up after the run. */
  sandbox: Sandbox
  /** Per-check activity log. Checks push every step/command/write here. */
  trace: ActivityTracer
  /** runCommand wrapper that traces every invocation into the activity log. */
  runCommand(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<CommandResult>
  /**
   * Directory the CLI was invoked against (used to resolve the configured
   * model provider, git remote, etc.). Never the sandbox.
   */
  projectRoot: string
  /** The runner options for this run (modelProvider / requireModel / …). */
  options: SelfTestOptions
}

export interface CheckResult {
  status: CheckStatus
  /** Short human-readable summary of what was verified. */
  detail?: string
}

export interface FeatureCheck {
  /** Stable, URL-safe id, e.g. `knowledge-store`. */
  id: string
  name: string
  category: SelfTestCategory
  description: string
  run(ctx: SelfTestContext): CheckResult | Promise<CheckResult>
}

export interface CheckRun {
  check: FeatureCheck
  status: CheckStatus
  durationMs: number
  detail?: string
  /** Stack trace when the check threw — surfaced in the dashboard. */
  error?: string
  steps: TraceStep[]
}

export interface SelfTestTotals {
  pass: number
  fail: number
  warn: number
  total: number
}

export interface SelfTestActivity {
  commands: number
  writes: number
  artifacts: number
  steps: number
}

export interface SelfTestReport {
  /** Package version under test. */
  version: string
  generatedAt: string
  durationMs: number
  totals: SelfTestTotals
  byCategory: Partial<Record<SelfTestCategory, SelfTestTotals>>
  runs: CheckRun[]
  activity: SelfTestActivity
}

export interface SelfTestOptions {
  category?: SelfTestCategory
  only?: string
  /**
   * Force the model provider for the real-inference check
   * (`local` | `wasm` | `openai` | `anthropic`). Defaults to the project
   * manifest's provider, or `local`.
   */
  modelProvider?: ModelProviderChoice
  /**
   * When true, a check that cannot run real model inference (no downloaded
   * GGUF / WASM weights, no API key) FAILS instead of warning — for CI runs
   * that guarantee a model is present.
   */
  requireModel?: boolean
  /** Directory used to resolve the project model config (default: cwd). */
  projectRoot?: string
}

// Forward declarations (defined in trace.ts) keep the type graph acyclic.
// Type-only circular imports are erased at runtime, so this is safe.
import type { ActivityTracer, Sandbox } from './trace'
export type { ActivityTracer, Sandbox } from './trace'
