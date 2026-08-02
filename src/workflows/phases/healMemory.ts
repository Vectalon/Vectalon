import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { LLMReviewFinding } from '../../sdlc/LLMCodeReviewer'

export interface FailedHealRecord {
  timestamp: number
  prompt: string
  file: string
  findings: LLMReviewFinding[]
}

const MAX_RECORDS = 50

export function failedHealsPath(projectRoot: string): string {
  return join(projectRoot, '.vectalon', 'knowledge', 'failed-heals.json')
}

/** Load prior failed-heal records (best-effort; corrupted/missing → []). */
export function loadFailedHeals(projectRoot: string): FailedHealRecord[] {
  try {
    const path = failedHealsPath(projectRoot)
    if (!existsSync(path)) return []
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return Array.isArray(parsed) ? (parsed as FailedHealRecord[]) : []
  } catch {
    return []
  }
}

/** Append records (newest first), capping at MAX_RECORDS. */
export function recordFailedHeals(projectRoot: string, records: FailedHealRecord[]): void {
  if (records.length === 0) return
  try {
    const existing = loadFailedHeals(projectRoot)
    const merged = [...records, ...existing].slice(0, MAX_RECORDS)
    const path = failedHealsPath(projectRoot)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(merged, null, 2))
  } catch {
    // Best-effort persistence must never break the phase.
  }
}

/** Compact human-readable rendering used to inject prior mistakes into prompts. */
export function formatFailedHeals(records: FailedHealRecord[]): string {
  return records
    .map(r => {
      const details = r.findings
        .map(f => `[${f.severity}] ${f.rule} (line ${f.line}): ${f.message}`)
        .join('; ')
      return `- ${r.file}: ${details}`
    })
    .join('\n')
}
