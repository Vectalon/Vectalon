import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../cli/logger'
import { runCommand } from './runCommand'
import type { TestRunnerAdapter, TestOptions, TestResult } from './types'

function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function getRunArgs(pm: 'npm' | 'yarn' | 'pnpm', script: string, extraArgs: string[] = [], silent = false): [string, string[]] {
  // Yarn 2+ (berry) rejects the `--silent` global flag with "Unknown Syntax
  // Error" — the flag must never be passed for yarn.
  if (pm === 'yarn') return ['yarn', [script, ...extraArgs]]
  if (pm === 'pnpm') return silent ? ['pnpm', ['run', '--silent', script, ...extraArgs]] : ['pnpm', ['run', script, ...extraArgs]]
  return silent ? ['npm', ['run', '--silent', script, '--', ...extraArgs]] : ['npm', ['run', script, '--', ...extraArgs]]
}

function readScripts(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }
    return pkg.scripts || {}
  } catch {
    return {}
  }
}

async function runScript(root: string, scriptName: string, extraArgs: string[] = [], silent = false): Promise<TestResult> {
  const pm = detectPackageManager(root)
  const [cmd, args] = getRunArgs(pm, scriptName, extraArgs, silent)
  const result = await runCommand(cmd, args, { cwd: root })
  return {
    ...result,
    summary: `${scriptName} ${result.success ? 'passed' : 'failed'}`,
  }
}

export class LocalTestRunnerAdapter implements TestRunnerAdapter {
  name = 'local'

  constructor(private root: string) {}

  async runTests(options?: TestOptions): Promise<TestResult> {
    const scripts = readScripts(this.root)
    const scriptName = scripts.test ? 'test' : 'jest'
    const extraArgs = options?.pattern ? [options.pattern] : []
    return runScript(this.root, scriptName, extraArgs, true)
  }

  async runLint(): Promise<TestResult> {
    const scripts = readScripts(this.root)
    const scriptName = scripts.lint ? 'lint' : scripts['lint:fix'] ? 'lint:fix' : ''
    if (!scriptName) {
      logger.warn('No lint script found in package.json; skipping')
      return { success: true, stdout: '', stderr: '', exitCode: 0, summary: 'no lint script' }
    }
    return runScript(this.root, scriptName)
  }

  async runTypeCheck(): Promise<TestResult> {
    const scripts = readScripts(this.root)
    const scriptName = scripts.typecheck ? 'typecheck' : scripts['type-check'] ? 'type-check' : ''
    if (!scriptName) {
      logger.warn('No typecheck script found in package.json; skipping')
      return { success: true, stdout: '', stderr: '', exitCode: 0, summary: 'no typecheck script' }
    }
    return runScript(this.root, scriptName)
  }

  async runPrettier(): Promise<TestResult> {
    const scripts = readScripts(this.root)
    const scriptName = scripts['prettier:check'] ? 'prettier:check' : scripts['format:check'] ? 'format:check' : scripts.prettier ? 'prettier' : ''
    if (!scriptName) {
      logger.warn('No prettier script found in package.json; skipping')
      return { success: true, stdout: '', stderr: '', exitCode: 0, summary: 'no prettier script' }
    }
    return runScript(this.root, scriptName)
  }
}

export class ConsoleTestRunnerAdapter implements TestRunnerAdapter {
  name = 'console'

  async runTests(options?: TestOptions): Promise<TestResult> {
    const message = options?.pattern
      ? `Tests: running "${options.pattern}"`
      : 'Tests: running full suite'
    logger.dim(`  ${message}${options?.coverage ? ' (with coverage)' : ''}`)

    return {
      success: true,
      stdout: 'Mock test run: all tests passed',
      stderr: '',
      exitCode: 0,
      summary: '0 failures (mock)',
    }
  }

  async runLint(): Promise<TestResult> {
    logger.dim('  Lint: running')
    return {
      success: true,
      stdout: 'Mock lint: no issues',
      stderr: '',
      exitCode: 0,
    }
  }

  async runTypeCheck(): Promise<TestResult> {
    logger.dim('  Type check: running')
    return {
      success: true,
      stdout: 'Mock type check: no errors',
      stderr: '',
      exitCode: 0,
    }
  }

  async runPrettier(): Promise<TestResult> {
    logger.dim('  Prettier: running')
    return {
      success: true,
      stdout: 'Mock prettier: no issues',
      stderr: '',
      exitCode: 0,
    }
  }
}

export class JestAdapter implements TestRunnerAdapter {
  name = 'jest'

  async runTests(options?: TestOptions): Promise<TestResult> {
    logger.info(`[Jest] Would run: npm test${options?.pattern ? ` -- ${options.pattern}` : ''}`)
    return {
      success: true,
      stdout: 'Jest run simulated',
      stderr: '',
      exitCode: 0,
      summary: 'Jest summary (mock)',
    }
  }

  async runLint(): Promise<TestResult> {
    return {
      success: true,
      stdout: 'npm run lint simulated',
      stderr: '',
      exitCode: 0,
    }
  }

  async runTypeCheck(): Promise<TestResult> {
    return {
      success: true,
      stdout: 'npm run typecheck simulated',
      stderr: '',
      exitCode: 0,
    }
  }

  async runPrettier(): Promise<TestResult> {
    return {
      success: true,
      stdout: 'npm run prettier:check simulated',
      stderr: '',
      exitCode: 0,
    }
  }
}

export function createTestRunnerAdapter(config: Record<string, unknown> & { root?: string; dryRun?: boolean }): TestRunnerAdapter {
  const provider = (config.provider as string) || 'local'
  if (config.dryRun) {
    return new ConsoleTestRunnerAdapter()
  }
  if (provider === 'jest') {
    return new JestAdapter()
  }
  return new LocalTestRunnerAdapter((config.root as string) || process.cwd())
}
