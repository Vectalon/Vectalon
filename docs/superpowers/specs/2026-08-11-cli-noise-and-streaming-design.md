# CLI Noise Elimination + Live Streaming — Design

**Status:** Approved (2026-08-11)
**Scope:** `packages/rn` — local inference (node-llama-cpp), benchmark CLI, model request chain.

## Problem

A `vectalon bench` leaderboard run currently:

1. Prints a wall of raw `load: control-looking token: 128247 '</s>' ...` lines from
   llama.cpp before any results appear.
2. Emits `(node:…) MaxListenersExceededWarning: 11 beforeExit listeners added to
   [process]. MaxListeners is 10.`
3. Runs all 11 scenarios silently (spinner + per-scenario one-liners only), then
   dumps the entire markdown report at the very end — output is produced *after*
   the work finishes instead of streaming in.

## Goals

- **G1 (W1):** No llama tokenizer noise and no `MaxListenersExceededWarning` in any
  CLI run, no matter which node-llama-cpp component emits them.
- **G2 (W2):** Local-model generation streams live (token counter + truncated text
  preview) during interactive CLI work, with zero change to MCP/agent output.
- **G3 (W3):** Benchmark scenario results print to the terminal as each scenario
  completes; the report still ends with the overall summary + baseline comparison.

**Non-goals:** remote-provider streaming (openai/anthropic/etc.), streaming in MCP
tool results (structured envelopes must stay clean), changing `--json` semantics,
changing `--output <file>` behavior.

---

## W1 — Kill the noise

### Root cause

- The `control-looking token` lines are emitted through node-llama-cpp *component*
  loggers. Today only `getLlama()` receives a filtered `logger`; `loadModel()` and
  `createContext()` do not, so their logger output (and lazy chat-wrapper
  resolution logs) bypass the filter. Additionally the native addon can write
  directly to the stderr fd — bypassing the JS `process.stderr.write` override.
- `MaxListenersExceededWarning`: node-llama-cpp registers multiple process
  cleanup listeners (`beforeExit`) per engine (tokenizer, model, context,
  session), and our noise filter adds its own `exit` + `beforeExit` pair; the
  combined count crosses the default `MaxListeners` of 10. Not a real leak —
  the engine is already a process-wide singleton (`getSharedLlama`).

### Design

1. **`createLlamaLogFilter()`** (new, in `src/model/local/inference.ts` or a small
   `src/model/local/llamaLog.ts`): returns a `logger` callback for node-llama-cpp
   that (a) drops lines matching the existing `shouldSuppressStderrLine` pattern
   (`control-looking token`) and (b) re-emits everything else at the right level
   (`console.error` for error, `console.warn` for warning; info/debug stay silent
   unless `VECTALON_DEBUG=1`, matching current behavior).
2. **Plumb it everywhere:** pass the same filtered logger to `getLlama()`,
   `loadModel()`, and `createContext()` — closing the actual gap.
3. **Keep the permanent stderr write-filter** (`installStderrNoiseFilter`) as the
   safety net for native fd writes and async-dispatch races. It stays idempotent.
   `withSuppressedTokenizerWarnings` remains as the per-inference belt-and-braces.
4. **MaxListeners:** replace our own `exit` + `beforeExit` pair with a single
   `beforeExit` listener (buffer drain), and bump
   `process.setMaxListeners(Math.max(process.getMaxListeners(), 24))` once, with a
   comment explaining the engine-internal listener count. No blanket `0` (Infinity).
5. **Tests:** extend the existing noise-filter tests (`shouldSuppressStderrLine`,
   `installStderrNoiseFilter` unit coverage) with: filter callback drops noise and
   passes through ordinary messages; the MaxListeners bump runs without warning;
   install remains idempotent.

---

## W2 — Live token streaming (local model)

### Design

1. **`InferenceOptions.onToken?: (tokens: unknown[]) => void`** (new) in
   `src/model/local/inference.ts` — deliberately typed against the project's own
   types, not node-llama-cpp's optional `Token` type, so the public API never
   hard-depends on the optional native module. `runInference` forwards it to
   `session.prompt({ ...opts, onToken })` when provided (the token text is
   extracted at the boundary).
2. **`ModelRequest.onToken?`** (new) in `src/model/types.ts`.
   `ModelRouter.generate` copies it into the provider request; the local provider
   forwards it to `runInference`. Other providers ignore it (typed as optional;
   remote streaming is a non-goal).
3. **Bench enablement:** `createModelGenerate` (src/bench/modelGenerate.ts)
   accepts an optional `onToken` and passes it through `modelRouter.generate`.
4. **CLI live preview (in `benchCommand`):** when streaming is active, render a
   single-line live preview to **stderr**:
   - a ticking token count and the first ~120 characters of raw output (updated
     in place with `\r` when the terminal supports it; otherwise append-only);
   - enabled only when `process.stderr.isTTY` and not `--json` — CI/pipe output
     stays clean;
   - the preview line is cleared once the scenario completes, before the
     per-scenario result line prints.
5. **Sink plumbing:** pass a `createTokenPreviewSink()` helper from the CLI into
   the generate seam so the preview logic is unit-testable without a model.
6. **MCP/agent paths unchanged:** no caller outside the bench path passes
   `onToken`, so tool results and workflow output are byte-for-byte identical.
7. **Tests:** onToken callback receives incremental token arrays (fake session);
   preview sink renders/clears correctly (TTY flag injectable); `--json` and
   non-TTY disable streaming.

---

## W3 — Incremental benchmark output

### Design

1. **Extract `formatScenarioSection(run)`** from `formatBenchmarkReport`
   (`src/bench/report.ts`): the per-scenario block (heading `### id — title`,
   composite line, axes, relative-to-human, generated files, guardrail failures).
   `formatBenchmarkReport` calls it internally so the full-report output is
   byte-identical.
2. **Stream in `benchCommand`:** the existing `onScenarioComplete` hook (in
   `src/cli/commands/bench.ts`) currently prints `[i/N] id → composite`; it now
   also writes the scenario section to stdout via `logger.out` as soon as the run
   finishes — results roll in live.
3. **End of run:** the final `Overall composite … guardrails …` block, the
   baseline comparison (when `--baseline`), and the completion line still print
   after all scenarios, in the same format as today.
4. **`--json`:** still a single pure JSON document on stdout at the end; scenario
   streaming is suppressed when `--json` is set (keeps stdout machine-parseable).
5. **`--output <file>`:** the file still receives the full report unchanged.
6. **Tests:** `formatScenarioSection` renders a known run correctly; the bench
   command's scenario-complete path emits a section (spy on the injected hooks);
   `--json` run writes no incremental sections to stdout.

---

## Error handling

- **W1:** the filter never throws; a malformed log line is passed through
  unchanged (fail-open), never dropped speculatively — existing held-partial logic
  already guards this.
- **W2:** if `onToken` throws (e.g. a broken preview sink), the error is caught and
  logged at debug level; inference still completes and returns the full response.
- **W3:** a scenario-section render failure never aborts the run — wrap the
  streaming print in the same try/catch used for progress lines.

## Testing strategy

- Unit tests for W1 (filter + max listeners), W2 (token sink + onToken plumbing),
  W3 (section extraction + bench hooks), all deterministic, no native module load.
- Full validation: `pnpm typecheck`, `pnpm lint`, `pnpm test` in `packages/rn`.
- Manual smoke: `vectalon bench --live --model local` on a TTY shows live tokens +
  rolling sections, zero noise lines, no listener warning.

## Effort

| Workstream | Scope | Est. |
|---|---|---|
| W1 | `llamaLog.ts` (new), `inference.ts`, tests | ~120 lines |
| W2 | `types.ts`, `inference.ts`, `ModelRouter.ts`, `LocalProvider.ts`, `modelGenerate.ts`, `bench.ts`, tests | ~130 lines |
| W3 | `report.ts`, `bench.ts`, tests | ~80 lines |

## Files touched (expected)

- `src/model/local/inference.ts` (logger plumbing, onToken, maxListeners)
- `src/model/local/llamaLog.ts` (new — filtered logger helper)
- `src/model/types.ts` (`ModelRequest.onToken`)
- `src/model/ModelRouter.ts`, `src/model/providers/LocalProvider.ts` (onToken pass-through)
- `src/bench/report.ts` (`formatScenarioSection`)
- `src/bench/modelGenerate.ts` (onToken seam)
- `src/cli/commands/bench.ts` (live preview + incremental sections)
- `__tests__/model/local/inference.test.ts`, `__tests__/bench/report.test.ts`,
  `__tests__/bench/modelGenerate.test.ts`, `__tests__/cli/bench.test.ts` (new/extended)
