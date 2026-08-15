/**
 * Render harness — the script executed inside the V-1 sandbox
 * Business Source License 1.1 (BSL-1.1)
 *
 * The harness is a self-contained CommonJS script (plus the embedded shim)
 * written into the sandbox root. It:
 *
 *  1. aliases `react` / `react-native` module loads to the bundled shim
 *  2. captures console.* into a bounded log
 *  3. requires the compiled entry module (relative imports resolve normally)
 *  4. renders the entry's default export headlessly to a JSON tree
 *  5. prints a single `VECTALON_RENDER: <json>` line for the parent to parse
 *
 * Module-load errors (missing deps, throw at import) and render-path errors
 * are reported structurally instead of crashing the run.
 */

import { SHIM_SOURCE } from './shim'

export const RENDER_MARKER = 'VECTALON_RENDER:'
export const MAX_LOG_ENTRIES = 200

export interface HarnessInput {
  root: string
  /** Absolute path of the compiled entry module (CJS). */
  entryJsPath: string
  /** Render-tree caps — guards against runaway recursion. */
  maxDepth?: number
  maxNodes?: number
}

/** Build the shim file content (written to <root>/shim.cjs). */
export function buildShimFile(): { path: string; content: string } {
  return { path: 'shim.cjs', content: SHIM_SOURCE }
}

export function buildHarnessScript(input: HarnessInput): string {
  const maxDepth = input.maxDepth ?? 40
  const maxNodes = input.maxNodes ?? 500
  const entry = input.entryJsPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

  return `'use strict';
// --- vectalon render harness (runs inside the V-1 sandbox) ---
const path = require('path');
const Module = require('module');
const fs = require('fs');
// Realpath the shim ONCE — Node caches modules by realpath, and on macOS the
// temp root is a /var → /private/var symlink. Aliasing to the symlinked path
// would create a SECOND shim instance (fresh hook state, broken hooks).
const shimPath = require.resolve(path.join(${JSON.stringify(input.root)}, 'shim.cjs'));
const shim = require(shimPath);

// 1. Alias react / react-native and the curated Expo/navigation packages to
//    the bundled shim so generated components (which import them) load
//    without any installed deps — the sandbox denies network and has no
//    node_modules. The classic JSX runtime emits bare React.createElement, so
//    also expose a global React.
global.React = shim;
global.ReactNative = shim;
const origResolve = Module._resolveFilename;
const SHIM_ALIASES = new Set([
  'react',
  'react-native',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'expo-status-bar',
  'react-native-safe-area-context',
  '@react-navigation/native',
  '@react-navigation/native-stack',
]);
Module._resolveFilename = function (request, parent, isMain, options) {
  if (SHIM_ALIASES.has(request)) {
    return shimPath;
  }
  return origResolve.call(this, request, parent, isMain, options);
};

// 2. Bounded console capture. Captured output goes to stderr (so the
//    VECTALON_RENDER marker on stdout stays parseable), and is also returned
//    structurally in the payload — clients read \`logs\`, not the stream.
const logs = [];
const cap = ${MAX_LOG_ENTRIES};
const record = (level, args) => {
  if (logs.length >= cap) return;
  const text = args.map(a => {
    try {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.message;
      return JSON.stringify(a);
    } catch { return String(a); }
  }).join(' ');
  logs.push({ level, message: text });
  if (level !== 'debug') process.stderr.write('[' + level + '] ' + text + '\\n');
};
['log', 'warn', 'error', 'info', 'debug'].forEach(l => {
  console[l] = (...args) => { record(l, args); };
});

function emit(result) {
  process.stdout.write(${JSON.stringify(RENDER_MARKER)} + JSON.stringify(result) + '\\n');
}

// 3. Load the compiled entry.
let mod;
try {
  mod = require(${JSON.stringify(entry)});
} catch (err) {
  emit({ ok: false, loadError: (err && err.message) ? err.message : String(err), logs });
  return;
}

// 4. Render the default export headlessly.
const Component = (mod && mod.default) || mod;
if (typeof Component !== 'function' && !(Component && Component.$$typeof)) {
  emit({ ok: false, loadError: 'entry has no default export component (got ' + (typeof Component) + ')', logs });
  return;
}
let tree = null;
let runtimeError;
try {
  tree = shim.renderToJson(Component, ${maxDepth}, ${maxNodes});
} catch (err) {
  runtimeError = (err && err.message) ? err.message : String(err);
}
emit({ ok: !runtimeError, tree, runtimeError, logs });
`
}
