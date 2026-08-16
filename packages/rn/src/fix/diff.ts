/**
 * Minimal unified-diff generator — no external dependency. Produces a
 * git-style `--- a/` / `+++ b/` hunk diff for one file (whole-file hunks),
 * good enough for the "show exactly what changed" surface of vc fix.
 * Business Source License 1.1 (BSL-1.1)
 */

/** Escape nothing — diff bodies are literal lines. */
export function unifiedDiff(file: string, oldContent: string, newContent: string): string {
  if (oldContent === newContent) return ''
  const a = oldContent.replace(/\n$/, '').split('\n')
  const b = newContent.replace(/\n$/, '').split('\n')
  const out: string[] = []
  out.push(`--- a/${file}`)
  out.push(`+++ b/${file}`)
  out.push(`@@ -1,${a.length} +1,${b.length} @@`)
  // LCS-free approach: walk both lists; equal runs are context, anything else
  // is a -/+ pair. Whole-file diff — exact and never wrong, just not minimal.
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) {
      out.push(` ${a[i]}`)
    } else {
      if (i < a.length) out.push(`-${a[i]}`)
      if (i < b.length) out.push(`+${b[i]}`)
    }
  }
  return out.join('\n') + '\n'
}
