/**
 * Metro-aware execution sandbox — orchestrator
 * Business Source License 1.1 (BSL-1.1)
 *
 * `renderInSandbox` is the flagship "compile + render before the diff" loop:
 *
 *  1. transpile each provided file (project Babel → offline TypeScript →
 *     parser-only syntax check)
 *  2. write the compiled modules + the self-contained render harness (with
 *     the embedded react/react-native shim) into an isolated temp root
 *  3. execute the harness inside the V-1 sandbox (scrubbed env, network
 *     denied, bounded by timeout + memory rlimits)
 *  4. return console logs, the headless render tree, and any load/render
 *     errors — so agents can self-correct on JSX/TS errors before a diff
 *     is ever presented
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, isAbsolute, join } from 'path'
import { runSandboxed } from '../sandbox'
import { compileSource } from './compile'
import { buildHarnessScript, buildShimFile, RENDER_MARKER } from './harness'
import type { RenderOptions, RenderResult } from './types'

const RENDER_TIMEOUT_MS = 30_000

/** Strip a .tsx/.ts/.jsx/.js extension so Node resolves the compiled .js. */
function toJsPath(filePath: string): string {
  return filePath.replace(/\.(tsx|ts|jsx|js)$/, '.js')
}

/** Reject absolute paths and any `..` traversal — file paths are sandbox-relative. */
function safeRelativePath(filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new Error(`render file path must be relative to the sandbox root: ${filePath}`)
  }
  const parts = filePath.split(/[\\/]/)
  if (parts.some(p => p === '..')) {
    throw new Error(`render file path must not contain .. traversal: ${filePath}`)
  }
  return filePath
}

/** Normalize a sandbox-relative path for matching (strip ./ and duplicate separators). */
function normalizeRel(p: string): string {
  return p.replace(/^\.\/+/, '').replace(/\/\/+/g, '/').replace(/\\/g, '/')
}

export async function renderInSandbox(options: RenderOptions): Promise<RenderResult> {
  const started = Date.now()
  const root = mkdtempSync(join(tmpdir(), 'vectalon-render-'))
  const compiled: RenderResult['compiled'] = []
  let transpiler: RenderResult['transpiler'] = 'none'
  let warning: string | undefined
  let entryJsPath: string | null = null

  const entryNorm = normalizeRel(options.entry)
  try {
    // 1. Compile every file. Paths are sandbox-relative (reject traversal).
    for (const rawFile of options.files) {
      const relPath = safeRelativePath(rawFile.path)
      const out = compileSource(rawFile.content, relPath, options.projectRoot)
      if (transpiler === 'none' || transpiler === 'parser') transpiler = out.transpiler
      if (out.warning) warning = out.warning
      if (!out.ok) {
        compiled.push({ path: relPath, ok: false, error: out.error })
        continue
      }
      const jsPath = toJsPath(relPath)
      const abs = join(root, jsPath)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, out.code || '')
      compiled.push({ path: relPath, ok: true })
      if (normalizeRel(relPath) === entryNorm) entryJsPath = abs
    }

    const entryCompiled = compiled.find(c => normalizeRel(c.path) === entryNorm)
    if (!entryCompiled || !entryCompiled.ok || !entryJsPath) {
      return {
        ok: false,
        transpiler,
        renderer: 'none',
        compiled,
        entry: options.entry,
        logs: [],
        tree: null,
        loadError: `entry ${options.entry} failed to compile`,
        durationMs: Date.now() - started,
        isolation: 'process',
        droppedEnv: [],
        warning,
      }
    }

    // 2. Write the shim + harness.
    const shimFile = buildShimFile()
    writeFileSync(join(root, shimFile.path), shimFile.content)
    const harnessPath = join(root, 'harness.cjs')
    writeFileSync(harnessPath, buildHarnessScript({ root, entryJsPath }))

    // 3. Run inside the V-1 sandbox (explicit node binary — never depends on
    //    the scrubbed PATH resolving `node`).
    const result = await runSandboxed(process.execPath, [harnessPath], {
      root,
      timeoutMs: options.timeoutMs ?? RENDER_TIMEOUT_MS,
      memoryMb: options.memoryMb,
      allowEnv: options.allowEnv,
      maxOutputBytes: 4 * 1024 * 1024,
    })

    // 4. Parse the marker line from stdout. Skip malformed markers (a
    //    component logging text that merely starts with the marker prefix
    //    must not break parsing).
    let rendered: { ok?: boolean; loadError?: string; runtimeError?: string; tree?: unknown; logs?: unknown[] } | null = null
    for (const line of result.stdout.split('\n')) {
      if (!line.startsWith(RENDER_MARKER)) continue
      try {
        rendered = JSON.parse(line.slice(RENDER_MARKER.length))
        break
      } catch {
        // malformed marker — keep scanning for a real one
      }
    }

    if (!rendered) {
      const reason = result.timedOut
        ? `render timed out after ${options.timeoutMs ?? RENDER_TIMEOUT_MS}ms`
        : result.error
          ? `sandbox failed to run node: ${result.error}`
          : `harness produced no render output (exit ${result.exitCode})${result.stderr ? ' — ' + result.stderr.slice(0, 300) : ''}`
      return {
        ok: false,
        transpiler,
        renderer: 'none',
        compiled,
        entry: options.entry,
        logs: [],
        tree: null,
        loadError: reason,
        durationMs: result.durationMs,
        isolation: result.isolation,
        droppedEnv: result.droppedEnv,
        warning,
      }
    }

    return {
      ok: rendered.ok === true && !rendered.runtimeError,
      transpiler,
      renderer: 'shim',
      compiled,
      entry: options.entry,
      logs: (rendered.logs || []).map(l => l as { level: 'log' | 'warn' | 'error' | 'info' | 'debug'; message: string }),
      tree: (rendered.tree as RenderResult['tree']) ?? null,
      loadError: rendered.loadError,
      runtimeError: rendered.runtimeError,
      durationMs: result.durationMs,
      isolation: result.isolation,
      droppedEnv: result.droppedEnv,
      warning,
    }
  } finally {
    // Never leave sandbox scratch behind.
    try {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
}
