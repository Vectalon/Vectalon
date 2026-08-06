import { reportError } from '../utils/safe'

/**
 * Whether the zero-config WASM tier is enabled.
 *
 * When true, a `local` provider run with no downloaded GGUF model transparently
 * falls through to the ONNX/WASM runtime (@huggingface/transformers) before
 * degrading to the deterministic stub — so a fresh `npm install` gives real
 * model output without an API key, a native build, or `vectalon pull`.
 *
 * Disabled when:
 *  - `RN_VECTALON_NO_WASM=1` (opt out — e.g. constrained networks);
 *  - running under tests (jest sets NODE_ENV=test) so suites never trigger a
 *    model download;
 *  - the transformers package cannot be resolved (should not happen — it is a
 *    regular dependency).
 */
export function wasmZeroConfigEnabled(): boolean {
  if (process.env.RN_VECTALON_NO_WASM === '1') return false
  if (process.env.NODE_ENV === 'test') return false
  try {
    require.resolve('@huggingface/transformers')
    return true
  } catch (err) {
    reportError(err, 'zero-config wasm: @huggingface/transformers is not resolvable')
    return false
  }
}
