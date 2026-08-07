import { CodeReviewAnalyzer } from '../../src/sdlc/CodeReviewAnalyzer'

const CODE = [
  "import React, { useEffect } from 'react'",
  'export function Feed() {',
  '  useEffect(() => {',
  '    heavyWork()',
  '  }, [])',
  '  const onPress = () => {',
  '    syncCompute()',
  '  }',
  '  return null',
  '}',
].join('\n')

describe('CodeReviewAnalyzer runtime integration', () => {
  it('cites the measured blocking time with the worklet suggestion', () => {
    const findings = new CodeReviewAnalyzer().review(CODE, 'tsx', [
      { function: 'useEffect', metric: 'blocking', valueMs: 500 },
    ])
    const runtime = findings.find(f => f.rule === 'runtime-blocking')
    expect(runtime).toBeTruthy()
    expect(runtime?.message).toBe('useEffect blocks the JS thread for 500ms — move to a worklet or defer off the JS thread.')
    expect(runtime?.line).toBe(3)
    expect(runtime?.severity).toBe('warning')
  })

  it('escalates blocking >= 1s to error', () => {
    const findings = new CodeReviewAnalyzer().review(CODE, 'tsx', [
      { function: 'useEffect', metric: 'blocking', valueMs: 1500 },
    ])
    expect(findings.find(f => f.rule === 'runtime-blocking')?.severity).toBe('error')
  })

  it('flags retained bytes per function', () => {
    const findings = new CodeReviewAnalyzer().review(CODE, 'tsx', [
      { function: 'onPress', metric: 'retained-size', valueBytes: 12 * 1024 * 1024 },
    ])
    const runtime = findings.find(f => f.rule === 'runtime-retained-size')
    expect(runtime).toBeTruthy()
    expect(runtime?.message).toContain('retains 12.0 MB on the heap')
    expect(runtime?.line).toBe(6)
  })

  it('ignores metrics whose function is not in the reviewed file', () => {
    const findings = new CodeReviewAnalyzer().review(CODE, 'tsx', [
      { function: 'SomeOtherComponent', metric: 'blocking', valueMs: 900 },
    ])
    expect(findings.some(f => f.rule === 'runtime-blocking')).toBe(false)
  })

  it('keeps the static-only path unchanged (backward compatible)', () => {
    const withRuntime = new CodeReviewAnalyzer().review(CODE, 'tsx', [
      { function: 'useEffect', metric: 'blocking', valueMs: 500 },
    ])
    const without = new CodeReviewAnalyzer().review(CODE)
    expect(withRuntime.length).toBe(without.length + 1)
  })
})
