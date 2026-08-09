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

  it('flags TouchableOpacity with use-pressable (Pressable over Touchable*)', () => {
    const code = "import { TouchableOpacity } from 'react-native'\n<TouchableOpacity onPress={go}><Text>Go</Text></TouchableOpacity>\n"
    const findings = new CodeReviewAnalyzer().review(code)
    const pressable = findings.filter(f => f.rule === 'use-pressable')
    // Import line + usage line are both flagged.
    expect(pressable.length).toBeGreaterThanOrEqual(1)
    expect(pressable[0].severity).toBe('warning')
  })

  it('flags leaked falsy renders (string/number) with no-leaked-render', () => {
    const code = 'return <View>{error && <Text>{error.message}</Text>}</View>\n'
    const findings = new CodeReviewAnalyzer().review(code)
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'no-leaked-render', severity: 'warning' })])
    )
  })

  it('catches optional-chaining leaks like {user?.name && <Text>}', () => {
    const code = 'return <View>{user?.name && <Text>{user.name}</Text>}</View>\n'
    const findings = new CodeReviewAnalyzer().review(code)
    expect(findings.some(f => f.rule === 'no-leaked-render')).toBe(true)
  })

  it('respects the !!value && and ternary escape hatches', () => {
    const coerced = 'return <View>{!!error && <Text>x</Text>}</View>\n'
    const ternary = 'return <View>{error ? <Text>{error.message}</Text> : null}</View>\n'
    expect(new CodeReviewAnalyzer().review(coerced).some(f => f.rule === 'no-leaked-render')).toBe(false)
    expect(new CodeReviewAnalyzer().review(ternary).some(f => f.rule === 'no-leaked-render')).toBe(false)
  })

  it('reports no findings for clean code', () => {
    expect(new CodeReviewAnalyzer().review('const x = 1\n')).toEqual([])
  })
})
