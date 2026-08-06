import { CodeReviewAnalyzer } from '../../src/sdlc/CodeReviewAnalyzer'

describe('CodeReviewAnalyzer', () => {
  it('flags console.log as a warning with a line number', () => {
    const code = "import React from 'react'\nconsole.log('hi')\nexport default App\n"
    const findings = new CodeReviewAnalyzer().review(code)
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'no-console-log', severity: 'warning', line: 2 }),
      ])
    )
  })

  it('flags empty catch blocks as errors', () => {
    const findings = new CodeReviewAnalyzer().review('try {\n  run()\n} catch (e) {}\n')
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'no-empty-catch', severity: 'error' })])
    )
  })

  it('flags the any type', () => {
    const findings = new CodeReviewAnalyzer().review('const x: any = 1\n')
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'no-any' })]))
  })

  it('flags TODO comments as info', () => {
    const findings = new CodeReviewAnalyzer().review('// TODO: fix later\nconst a = 1\n')
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'todo-comment', severity: 'info' })])
    )
  })

  it('reports no findings for clean code', () => {
    expect(new CodeReviewAnalyzer().review('const x = 1\n')).toEqual([])
  })
})
