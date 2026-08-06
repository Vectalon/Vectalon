/**
 * Phase V-5 benchmark — human reference solutions (M6).
 *
 * Each scenario ships with a human-authored reference solution in
 * bench/references/<scenario-id>.json. The runner scores the reference with the
 * same axes as generated code, then reports the generated score relative to it
 * (e.g. "generated code is 92% of human best-practice adherence").
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { BenchGeneratedFile } from './types'
import { collectJsonFiles } from './fs'

export interface ReferenceSolution {
  id: string
  files: BenchGeneratedFile[]
}

export interface LoadReferencesResult {
  /** scenario id → reference files. */
  references: Map<string, BenchGeneratedFile[]>
  /** Per-file problems; entries with problems are excluded. */
  problems: Array<{ file: string; problems: string[] }>
}

/** Default reference directory: <packageRoot>/bench/references (source or dist). */
export function defaultReferencesDir(): string {
  return resolve(__dirname, '..', '..', 'bench', 'references')
}

/** Validate a parsed reference file; returns a list of problems (empty = valid). */
export function validateReference(raw: unknown): string[] {
  const problems: string[] = []
  if (!raw || typeof raw !== 'object') return ['reference is not an object']
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id.trim()) problems.push('missing string field: id')
  if (!Array.isArray(r.files) || r.files.length === 0) {
    problems.push('missing non-empty array field: files')
  } else {
    for (const f of r.files) {
      if (!f || typeof f !== 'object') {
        problems.push('files entry is not an object')
        continue
      }
      const file = f as Record<string, unknown>
      if (typeof file.path !== 'string' || !file.path.trim()) problems.push('file missing string field: path')
      if (typeof file.content !== 'string') problems.push(`file ${String(file.path)} missing string field: content`)
    }
  }
  return problems
}

export function loadReferences(dir = defaultReferencesDir()): LoadReferencesResult {
  const problems: LoadReferencesResult['problems'] = []
  const references = new Map<string, BenchGeneratedFile[]>()

  if (!existsSync(dir)) {
    return { references, problems: [{ file: dir, problems: ['directory does not exist'] }] }
  }

  for (const file of collectJsonFiles(dir)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (err) {
      problems.push({ file, problems: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] })
      continue
    }
    const issues = validateReference(raw)
    if (issues.length > 0) {
      problems.push({ file, problems: issues })
      continue
    }
    const solution = raw as ReferenceSolution
    if (references.has(solution.id)) {
      problems.push({ file, problems: [`duplicate reference id: ${solution.id}`] })
      continue
    }
    references.set(solution.id, solution.files)
  }

  return { references, problems }
}
