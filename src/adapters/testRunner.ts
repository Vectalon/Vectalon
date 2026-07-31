import type { TestRunnerAdapter, TestOptions, TestResult } from './types'

export class ConsoleTestRunnerAdapter implements TestRunnerAdapter {
  name = 'console'

  async runTests(options?: TestOptions): Promise<TestResult> {
    const message = options?.pattern
      ? `[Test] Would run tests matching "${options.pattern}"`
      : '[Test] Would run the full test suite'
    console.log(message)
    if (options?.coverage) {
      console.log('[Test] With coverage enabled')
    }

    return {
      success: true,
      stdout: 'Mock test run: all tests passed',
      stderr: '',
      exitCode: 0,
      summary: '0 failures (mock)',
    }
  }

  async runLint(): Promise<TestResult> {
    console.log('[Test] Would run lint')
    return {
      success: true,
      stdout: 'Mock lint: no issues',
      stderr: '',
      exitCode: 0,
    }
  }

  async runTypeCheck(): Promise<TestResult> {
    console.log('[Test] Would run type check')
    return {
      success: true,
      stdout: 'Mock type check: no errors',
      stderr: '',
      exitCode: 0,
    }
  }
}

export class JestAdapter implements TestRunnerAdapter {
  name = 'jest'

  async runTests(options?: TestOptions): Promise<TestResult> {
    console.log(`[Jest] Would run: npm test${options?.pattern ? ` -- ${options.pattern}` : ''}`)
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
}

export function createTestRunnerAdapter(config: Record<string, unknown>): TestRunnerAdapter {
  const provider = (config.provider as string) || 'console'
  if (provider === 'jest') {
    return new JestAdapter()
  }
  return new ConsoleTestRunnerAdapter()
}
