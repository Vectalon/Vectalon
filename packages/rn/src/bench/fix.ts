/**
 * Phase V-5 benchmark — fix generate seam (upgrade-breakage + debugging).
 *
 * Upgrade and debugging scenarios (e.g. rn-36 "Upgrade RN 0.73 → 0.74
 * breaking changes", rn-40 "Diagnose and fix the Metro resolution failure")
 * ask the generator to REPAIR broken fixture files — the inverse of the
 * add-feature scaffold. `deterministicGenerate` has no branch for that, so
 * these scenarios previously produced zero files and scored n/a.
 *
 * This seam applies `scenario.fixEdits` to the fixture files and emits each
 * changed file with its complete new content:
 *   - literal find → replace on the fixture's content (first occurrence),
 *   - a missing `find` in a fixture is a hard error the runner surfaces as a
 *     problem — the seam never silently succeeds without applying its edit,
 *   - the file is emitted whenever at least one of its edits applied, so a
 *     multi-edit file is returned whole with every applied edit in place.
 *
 * The emitted files are scored by the same rubric that scores the human
 * reference (the `fix-applied` adherence check verifies each declared
 * `replace` is present and its `find` is gone) plus the guardrails pass, so
 * upgrade/debugging scenarios get a real adherence + guardrails composite
 * instead of n/a. Deterministic — no model calls.
 */
import type { BenchGeneratedFile, BenchScenario } from './types'

/** True when the scenario declares deterministic fix edits. */
export function isFixScenario(scenario: BenchScenario): boolean {
  return (scenario.fixEdits?.length ?? 0) > 0
}

/** Apply every declared edit to the fixture files; emit changed files whole. */
export function fixGenerate(scenario: BenchScenario): BenchGeneratedFile[] {
  const edits = scenario.fixEdits || []
  if (edits.length === 0) return []

  const fixtures = scenario.fixtures || {}
  const perFile = new Map<string, Array<{ find: string; replace: string }>>()
  for (const edit of edits) {
    const list = perFile.get(edit.file) || []
    list.push({ find: edit.find, replace: edit.replace })
    perFile.set(edit.file, list)
  }

  const emitted: BenchGeneratedFile[] = []
  for (const [file, fileEdits] of perFile.entries()) {
    let content = fixtures[file]
    if (content === undefined) {
      // The edit targets a file the fixtures don't have — surface loudly so
      // the scenario author (not the seam) fixes the mismatch.
      throw new Error(`fixGenerate: scenario ${scenario.id} edits ${file} but the fixture does not define it`)
    }
    let applied = 0
    for (const { find, replace } of fileEdits) {
      if (find === replace) {
        applied++
        continue
      }
      const idx = content.indexOf(find)
      if (idx === -1) {
        throw new Error(`fixGenerate: scenario ${scenario.id} — '${find.slice(0, 60)}…' not found in ${file}`)
      }
      content = content.slice(0, idx) + replace + content.slice(idx + find.length)
      applied++
    }
    if (applied > 0) emitted.push({ path: file, content })
  }
  return emitted
}
