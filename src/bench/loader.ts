import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { validateScenario, BenchScenario } from './types'

export interface LoadScenariosResult {
  scenarios: BenchScenario[]
  /** Per-file problems; scenarios with problems are excluded from `scenarios`. */
  problems: Array<{ file: string; problems: string[] }>
}

/** Default scenario directory: <packageRoot>/bench/scenarios (source or dist). */
export function defaultScenariosDir(): string {
  return resolve(__dirname, '..', '..', 'bench', 'scenarios')
}

export function loadScenarios(dir = defaultScenariosDir()): LoadScenariosResult {
  const problems: LoadScenariosResult['problems'] = []
  const scenarios: BenchScenario[] = []

  if (!existsSync(dir)) {
    return { scenarios, problems: [{ file: dir, problems: ['directory does not exist'] }] }
  }

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (err) {
      problems.push({ file, problems: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] })
      continue
    }
    const issues = validateScenario(raw)
    if (issues.length > 0) {
      problems.push({ file, problems: issues })
      continue
    }
    scenarios.push(raw as BenchScenario)
  }

  return { scenarios, problems }
}
