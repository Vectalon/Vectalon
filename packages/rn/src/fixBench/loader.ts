/**
 * vc fix-bench — scenario loading (mirrors bench/loader.ts). Scenarios live as
 * JSON files in bench/fix/ (default), each self-contained: broken + healthy
 * file maps, the issue string, an optional failing log, and the expected
 * diagnosis/fix. Business Source License 1.1 (BSL-1.1).
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { validateFixBenchScenario, type FixBenchScenario } from './types'
import { collectJsonFiles } from '../bench/fs'

export interface LoadFixBenchScenariosResult {
  scenarios: FixBenchScenario[]
  /** Per-file problems; scenarios with problems are excluded. */
  problems: Array<{ file: string; problems: string[] }>
}

/** Default scenario directory: <packageRoot>/bench/fix (source or dist). */
export function defaultFixScenariosDir(): string {
  return resolve(__dirname, '..', '..', 'bench', 'fix')
}

export function loadFixBenchScenarios(dir = defaultFixScenariosDir()): LoadFixBenchScenariosResult {
  const problems: LoadFixBenchScenariosResult['problems'] = []
  const scenarios: FixBenchScenario[] = []

  if (!existsSync(dir)) {
    return { scenarios, problems: [{ file: dir, problems: ['directory does not exist'] }] }
  }

  const seenIds = new Set<string>()
  for (const file of collectJsonFiles(dir)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (err) {
      problems.push({ file, problems: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] })
      continue
    }
    const issues = validateFixBenchScenario(raw)
    if (issues.length > 0) {
      problems.push({ file, problems: issues })
      continue
    }
    const scenario = raw as FixBenchScenario
    if (seenIds.has(scenario.id)) {
      problems.push({ file, problems: [`duplicate scenario id: ${scenario.id}`] })
      continue
    }
    seenIds.add(scenario.id)
    scenarios.push(scenario)
  }

  return { scenarios, problems }
}
