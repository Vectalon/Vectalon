/** Provider fallback text can echo prompts or prior JSON; it is never model evidence. */
export function isModelFallback(content: string): boolean {
  return content.includes('[Local model fallback')
    || content.includes('[Wasm model fallback')
    || content.includes('[Model fallback:')
    || content.includes('no downloaded model')
}
