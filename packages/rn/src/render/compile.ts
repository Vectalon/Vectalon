/**
 * Transpile layer — Babel (Metro pipeline) → TypeScript (offline) → parser
 * Business Source License 1.1 (BSL-1.1)
 *
 * Generated TS/TSX is compiled through the same Babel presets Metro uses
 * (resolved from the project root when present, so a real RN project gets the
 * exact project transform), with a fully offline TypeScript `transpileModule`
 * fallback (covers the sandbox selftest and any project without Babel), and a
 * parse-only last resort via @babel/parser that still surfaces JSX/TS syntax
 * errors deterministically.
 */

import { parse } from '@babel/parser'
import { existsSync } from 'fs'
import type { TranspilerKind } from './types'

export interface CompileOutput {
  ok: boolean
  code?: string
  error?: string
  transpiler: TranspilerKind
  /** Non-fatal note (e.g. parser-only fallback). */
  warning?: string
}

interface BabelCore {
  transformSync(source: string, opts: Record<string, unknown>): { code: string | null }
}

interface TypeScriptModule {
  transpileModule(source: string, opts: Record<string, unknown>): { outputText: string; diagnostics: { messageText: string }[] }
}

function tryRequire<T>(from: string, id: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(require.resolve(id, { paths: [from] })) as T
  } catch {
    return null
  }
}

/** Resolve the project's Babel (Metro transform) from a root, if present. */
export function resolveProjectBabel(projectRoot: string): BabelCore | null {
  return tryRequire<BabelCore>(projectRoot, '@babel/core')
}

/**
 * Compile a TS/TSX file. `projectRoot` (optional) prefers the project's Babel
 * — the exact pipeline Metro uses; otherwise the offline TS transpiler; and
 * finally a parser-only syntax check.
 */
export function compileSource(content: string, filename: string, projectRoot?: string): CompileOutput {
  // 1. Project Babel (Metro's own transform chain) — highest fidelity, only
  //    when the project root genuinely exists and ships TS/React presets.
  //    (Requiring with `paths` does not fully isolate resolution under jest,
  //    so a bogus root could otherwise pull the harness's own @babel/core and
  //    mangle TS without the TypeScript preset — fall through to TS instead.)
  if (projectRoot && existsSync(projectRoot)) {
    const babel = resolveProjectBabel(projectRoot)
    if (babel) {
      try {
        const presets = ['@babel/preset-react', '@babel/preset-typescript'].filter(p => {
          try {
            require.resolve(p, { paths: [projectRoot] })
            return true
          } catch {
            return false
          }
        })
        // Babel without TS/React presets cannot transform TSX — prefer the
        // offline TypeScript transpiler below.
        if (presets.length > 0) {
          const out = babel.transformSync(content, {
            filename,
            presets,
            babelrc: false,
            configFile: false,
          })
          if (out && out.code) {
            return { ok: true, code: out.code, transpiler: 'babel' }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Presets missing → fall through to TS transpiler rather than failing.
        if (!/Cannot find module|preset|Unknown plugin/i.test(message)) {
          return { ok: false, error: message, transpiler: 'babel' }
        }
      }
    }
  }

  // 2. Offline TypeScript transpileModule (no network, no project deps).
  const ts = tryRequire<TypeScriptModule>(__dirname, 'typescript')
  if (ts) {
    try {
      const out = ts.transpileModule(content, {
        compilerOptions: {
          target: 'ES2020',
          module: 'CommonJS',
          jsx: 'React',
          esModuleInterop: true,
          isolatedModules: true,
          sourceMap: false,
        },
        fileName: filename,
      })
      if (out.diagnostics && out.diagnostics.length > 0) {
        const first = out.diagnostics[0]
        const message = typeof first.messageText === 'string' ? first.messageText : JSON.stringify(first.messageText)
        return { ok: false, error: `${message} (${filename})`, transpiler: 'typescript' }
      }
      // Backstop: transpileModule silently recovers from some syntax errors
      // (e.g. unclosed JSX). The bundled parser is deterministic about them.
      try {
        parse(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript', 'decorators-legacy'],
        })
      } catch (parseErr) {
        const message = parseErr instanceof Error ? parseErr.message.split('\n')[0] : String(parseErr)
        return { ok: false, error: `${message} (${filename})`, transpiler: 'typescript' }
      }
      return { ok: true, code: out.outputText, transpiler: 'typescript' }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), transpiler: 'typescript' }
    }
  }

  // 3. Parser-only — deterministic syntax check with the bundled @babel/parser.
  try {
    parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
    return { ok: true, transpiler: 'parser', warning: 'no transpiler available — syntax checked with @babel/parser only (install typescript or a project Babel setup for full compile+render)' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), transpiler: 'parser' }
  }
}

