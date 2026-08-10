import { parseVerificationReport, renderFailureCard, renderWorkflowSummary, renderStageLine, formatDuration, failedCheckFacts } from '../../src/cli/workflowReport'
import type { WorkflowState, PhaseResult } from '../../src/adapters/types'

// Strip ANSI so assertions work regardless of whether jest forces colors.
const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')
const plain = (s: string) => s.replace(ANSI_RE, '')

const REPORT = `# Verification report

Detected 3 validation command(s) from package.json scripts and React Native CLI project structure.

- Tests: failed (exit 1)
**stderr**
\`\`\`
PASS src/othvac/services/interactors/DataInteractor.test.ts
  ● Console

    console.debug
      DataInteractor: Starting token renewal

      at DataInteractor.debug (src/othvac/services/interactors/DataInteractor.ts:84:17)
\`\`\`
**stdout**
\`\`\`
-------------------------------------------|---------|----------|---------|---------|----
File                                       | % Stmts | % Branch | % Funcs | % Lines
-------------------------------------------|---------|----------|---------|---------|----
All files                                  |   94.88 |    82.88 |   93.97 |   95.27
\`\`\`
- Lint: failed (exit 1)
**stdout**
\`\`\`
/Users/bhishak/Documents/OTHVAC-Mobile/HVACMobileApp/.vectalon/metro/vectalon-reporter.js
   5:13  error  Insert \`;\`  prettier/prettier
\`\`\`
- Prettier: passed (exit 0)
**stdout**
\`\`\`
Checking formatting...
All matched files use Prettier code style!
\`\`\`
- Type check: failed (exit 2)
**stdout**
\`\`\`
src/othvac/screens/selectarea/__tests__/MultiselectAreaScreen.test.tsx(289,10): error TS2741: Property 'searchText' is missing in type
\`\`\`
- Android assemble: passed (rn-cli-default, exit 0)
- Dependency check: pass — no matching package in package.json
- Import scan: pass — no source imports of the removed package remain
- Native scan: FAIL — 14 native reference(s) remain in ios/ and android/ (ios ios/AppCenter-Config.plist:4 (plist), ios ios/AppDelegate.swift:88 (code))
- Maestro E2E: failed — 6 flow(s) executed
- Visual check: skipped — screenshot failed (No devices are booted.)
- TDD validation: skipped (no new scaffold tests required for this intent)
- Code review: pass — no critical issues found

Some checks failed. Review the command output above.
`

describe('parseVerificationReport', () => {
  it('parses failed checks with exit codes and detail', () => {
    const checks = parseVerificationReport(REPORT)
    const lint = checks.find(c => c.name === 'Lint')
    expect(lint).toBeDefined()
    expect(lint!.status).toBe('failed')
    expect(lint!.exitCode).toBe(1)
    expect(lint!.stdout).toContain('Insert `;`')

    const tests = checks.find(c => c.name === 'Tests')
    expect(tests!.status).toBe('failed')
    expect(tests!.exitCode).toBe(1)
    expect(tests!.stderr).toContain('DataInteractor: Starting token renewal')
    expect(tests!.stdout).toContain('All files')

    const typeCheck = checks.find(c => c.name === 'Type check')
    expect(typeCheck!.exitCode).toBe(2)

    const native = checks.find(c => c.name === 'Native scan')
    expect(native!.status).toBe('failed')
    expect(native!.detail).toContain('14 native reference(s)')
  })

  it('parses passing, skipped, and pass/FAIL statuses', () => {
    const checks = parseVerificationReport(REPORT)
    expect(checks).toHaveLength(12)
    expect(checks.find(c => c.name === 'Prettier')!.status).toBe('passed')
    expect(checks.find(c => c.name === 'Android assemble')!.status).toBe('passed')
    expect(checks.find(c => c.name === 'Android assemble')!.exitCode).toBe(0)
    expect(checks.find(c => c.name === 'Dependency check')!.status).toBe('passed')
    expect(checks.find(c => c.name === 'Visual check')!.status).toBe('skipped')
    expect(checks.find(c => c.name === 'TDD validation')!.status).toBe('skipped')
    expect(checks.find(c => c.name === 'Code review')!.status).toBe('passed')
    expect(checks.find(c => c.name === 'Maestro E2E')!.status).toBe('failed')
  })

  it('reports zero checks for non-verification output', () => {
    expect(parseVerificationReport('Phase failed: boom')).toEqual([])
    expect(parseVerificationReport('')).toEqual([])
  })

  it('is robust to truncated report output (check without a body)', () => {
    const checks = parseVerificationReport('- Lint: failed (exit 1)\n')
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({ name: 'Lint', status: 'failed', exitCode: 1 })
  })
})

function failingState(): WorkflowState {
  const phases: PhaseResult[] = [
    { id: 'prd', name: 'Product Requirements Document', description: '', status: 'completed', output: '', artifacts: [], startedAt: 1000, completedAt: 2100 },
    { id: 'scope', name: 'Feature scoping and impact analysis', description: '', status: 'completed', output: '', artifacts: [], startedAt: 2100, completedAt: 3500 },
    { id: 'verification', name: 'Verification', description: '', status: 'failed', output: REPORT, artifacts: [{ type: 'document', title: 'Verification', content: REPORT, path: '/tmp/app/docs/vectalon/feature-development/run-1/verification.md' }], startedAt: 3500, completedAt: 6500 },
    { id: 'readiness', name: 'Readiness', description: '', status: 'pending', output: '', artifacts: [], },
  ]    // Implementation phase with a file artifact (non-document) so the summary
    // exercises the "Files created or modified" section.
    phases.push({
      id: 'implementation',
      name: 'Implementation',
      description: '',
      status: 'completed',
      output: '',
      artifacts: [{ type: 'code', title: 'x', content: '', path: '/tmp/app/scripts/remove-appcenter.sh' }],
      startedAt: 3500,
      completedAt: 4200,
    })
    return { id: 'run-1', workflowId: 'feature-development', prompt: 'remove appcenter', status: 'failed', phases, createdAt: 1000, updatedAt: 6500 }
}

describe('renderWorkflowSummary', () => {
  it('renders numbered stages with marks, files, docs, commands, and context', () => {
    const state = failingState()
    const out = plain(renderWorkflowSummary(state, 'Feature Development', '/tmp/app', {
      model: 'local (qwen2.5-coder-1.5b)',
      intentLabel: 'remove-dependency/appcenter',
      skills: ['Expo Router', 'React Native Expert'],
      commands: [
        { command: 'yarn lint', exitCode: 1, success: false, durationMs: 4100 },
        { command: 'yarn prettier:check', exitCode: 0, success: true, durationMs: 1200 },
      ],
      docsDir: '/tmp/app/docs/vectalon/feature-development/run-1',
      docFiles: ['docs/vectalon/feature-development/run-1/verification.md'],
      logFile: '/tmp/app/.vectalon/logs/vectalon.log',
    }))

    expect(out).toContain('Workflow: Feature Development')
    expect(out).toContain('ID: run-1')
    expect(out).toContain('Status: failed')
    expect(out).toContain('SDLC stages (5)')
    expect(out).toContain('Product Requirements Document')
    expect(out).toContain('Feature scoping and impact analysis')
    expect(out).toContain('Verification')
    expect(out).toContain('Files created or modified:')
    expect(out).toContain('scripts/remove-appcenter.sh')
    expect(out).toContain('docs/vectalon/feature-development/run-1/verification.md')
    expect(out).toContain('Commands run (2) — 1 failed')
    expect(out).toContain('yarn lint')
    expect(out).toContain('Skills:')
    expect(out).toContain('Expo Router')
    expect(out).toContain('vectalon feature --resume run-1')
    expect(out).toContain('Intent:')
    expect(out).toContain('remove-dependency/appcenter')
  })

  it('keeps the Status word plain (no ANSI) so logs and parsers match', () => {
    const out = renderWorkflowSummary(failingState(), 'Feature Development', '/tmp/app', {
      model: 'm',
      skills: [],
      commands: [],
      docsDir: '/x',
      docFiles: [],
      logFile: null,
    })
    expect(plain(out)).toContain('Status: failed')
    const statusLine = plain(out).split('\n').find(l => l.startsWith('Status:'))
    expect(statusLine).toBe('Status: failed')
  })
})

describe('failedCheckFacts', () => {
  it('extracts the salient file/line from a failing lint check', () => {
    const facts = failedCheckFacts(REPORT)
    const lint = facts.find(f => f.statement.startsWith('lint failed (exit 1)'))
    expect(lint).toBeDefined()
    expect(lint!.statement).toContain('.vectalon/metro/vectalon-reporter.js')
  })

  it('uses the check detail when the check carries one (native scan)', () => {
    const facts = failedCheckFacts(REPORT)
    const native = facts.find(f => f.statement.startsWith('native scan failed'))
    expect(native).toBeDefined()
    expect(native!.statement).toContain('14 native reference(s) remain')
    // No exit code on FAIL-with-detail lines.
    expect(native!.statement).not.toContain('(exit')
  })

  it('keeps the real error line from a type check failure', () => {
    const facts = failedCheckFacts(REPORT)
    const type = facts.find(f => f.statement.startsWith('type check failed (exit 2)'))
    expect(type).toBeDefined()
    expect(type!.statement).toContain('MultiselectAreaScreen.test.tsx(289,10): error TS2741')
  })

  it('drops pure-noise output (jest banners, console spam, coverage tables)', () => {
    const facts = failedCheckFacts(REPORT)
    const tests = facts.find(f => f.statement.startsWith('tests failed'))
    expect(tests).toBeDefined()
    // stderr is PASS banners + console.debug + stack frames; stdout is the
    // coverage table — none of it is a salient error line.
    expect(tests!.statement).toBe('tests failed (exit 1)')
    expect(tests!.statement).not.toContain('PASS')
    expect(tests!.statement).not.toContain('console.debug')
    expect(tests!.statement).not.toContain('All files')
  })

  it('relativizes absolute machine paths against the project root', () => {
    const facts = failedCheckFacts(
      '- Lint: failed (exit 1)\n**stdout**\n```\n/Users/bhishak/Documents/OTHVAC-Mobile/HVACMobileApp/.vectalon/metro/vectalon-reporter.js\n   5:13  error  Insert `;`  prettier/prettier\n```\n',
      '/Users/bhishak/Documents/OTHVAC-Mobile/HVACMobileApp'
    )
    const lint = facts.find(f => f.statement.startsWith('lint failed'))
    expect(lint!.statement).toBe(
      'lint failed (exit 1): .vectalon/metro/vectalon-reporter.js'
    )
    expect(lint!.statement).not.toContain('/Users/bhishak')
  })

  it('keeps content after a console.error marker (the real failure signal)', () => {
    const facts = failedCheckFacts(
      '- Tests: failed (exit 1)\n**stderr**\n```\n    console.error\n      Error: Failed to fetch https://api.example.com\n      at fetchData (src/api.ts:10:5)\n```\n'
    )
    const tests = facts.find(f => f.statement.startsWith('tests failed'))
    expect(tests!.statement).toBe(
      'tests failed (exit 1): Error: Failed to fetch https://api.example.com'
    )
  })

  it('skips the whole multi-line console block, not just its first line', () => {
    const facts = failedCheckFacts(
      '- Tests: failed (exit 1)\n**stderr**\n```\n    console.debug\n      DataInteractor: Starting token renewal\n      {extra: "log line"}\n      at DataInteractor.debug (src/DataInteractor.ts:84:17)\n```\n'
    )
    const tests = facts.find(f => f.statement.startsWith('tests failed'))
    // No app-log content may leak into the fact.
    expect(tests!.statement).toBe('tests failed (exit 1)')
    expect(tests!.statement).not.toContain('token renewal')
    expect(tests!.statement).not.toContain('extra')
  })

  it('never emits facts for passing or skipped checks', () => {
    const facts = failedCheckFacts(REPORT)
    expect(facts.some(f => f.statement.includes('prettier'))).toBe(false)
    expect(facts.some(f => f.statement.includes('maestro e2e'))).toBe(true) // failed
    expect(facts.some(f => f.statement.includes('visual check'))).toBe(false)
    expect(facts.some(f => f.statement.includes('tdd validation'))).toBe(false)
    expect(facts.some(f => f.statement.includes('code review'))).toBe(false)
  })

  it('returns [] for non-verification output and all-pass reports', () => {
    expect(failedCheckFacts('Phase failed: boom')).toEqual([])
    expect(failedCheckFacts('- Prettier: passed (exit 0)\n')).toEqual([])
    expect(failedCheckFacts('')).toEqual([])
  })
})

describe('renderFailureCard', () => {
  it('lists failing checks with exit codes and points to report, log, and resume', () => {
    const phase = failingState().phases.find(p => p.id === 'verification')!
    const card = plain(renderFailureCard(phase, {
      docsFile: 'docs/vectalon/feature-development/run-1/verification.md',
      stateId: 'run-1',
      logFile: '/tmp/app/.vectalon/logs/vectalon.log',
    }))

    expect(card).toContain('Verification failed')
    expect(card).toContain('5 of 12 check(s) failed')
    expect(card).toContain('Tests')
    expect(card).toContain('(exit 1)')
    expect(card).toContain('Type check')
    expect(card).toContain('(exit 2)')
    expect(card).toContain('Native scan')
    expect(card).toContain('14 native reference(s)')
    expect(card).toContain('First failure — Tests')
    expect(card).toContain('DataInteractor: Starting token renewal')
    expect(card).toContain('Full report: docs/vectalon/feature-development/run-1/verification.md')
    expect(card).toContain('Command log: /tmp/app/.vectalon/logs/vectalon.log')
    expect(card).toContain('vectalon feature --resume run-1')
  })

  it('shows a bounded excerpt of a non-verification phase', () => {
    const phase: PhaseResult = {
      id: 'implementation',
      name: 'Implementation',
      description: '',
      status: 'failed',
      output: 'line 1\nline 2\n'.repeat(30),
      artifacts: [],
    }
    const card = plain(renderFailureCard(phase, { docsFile: 'docs/x.md', stateId: 'run-1', logFile: null }))
    expect(card).toContain('Implementation failed')
    expect(card).toContain('vectalon feature --resume run-1')
  })
})

describe('renderStageLine + formatDuration', () => {
  it('renders a live breadcrumb with position, mark, and duration', () => {
    const phase: PhaseResult = {
      id: 'task',
      name: 'Task creation',
      description: '',
      status: 'completed',
      output: '',
      artifacts: [],
      startedAt: 1000,
      completedAt: 3100,
    }
    expect(plain(renderStageLine(phase, 4, 13))).toContain('[5/13]')
    expect(plain(renderStageLine(phase, 4, 13))).toContain('Task creation')
    expect(plain(renderStageLine(phase, 4, 13))).toContain('(2.1s)')
  })

  it('formats durations compactly', () => {
    expect(formatDuration(0, 500)).toBe('500ms')
    expect(formatDuration(0, 2100)).toBe('2.1s')
    expect(formatDuration(0, 372000)).toBe('6m 12s')
    expect(formatDuration(undefined, 100)).toBe('')
  })
})
