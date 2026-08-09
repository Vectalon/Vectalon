import { CodeReviewAnalyzer } from '../../src/sdlc/CodeReviewAnalyzer'
import { verifyLLMReview, type LLMCodeReview } from '../../src/sdlc/LLMCodeReviewer'

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

  it('flags animated layout properties (transform and opacity are GPU-safe)', () => {
    const bad = 'const style = useAnimatedStyle(() => ({ height: withTiming(200) }))\n'
    expect(new CodeReviewAnalyzer().review(bad).some(f => f.rule === 'animation-layout-props')).toBe(true)
    const good = 'const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 }], opacity: 1 }))\n'
    expect(new CodeReviewAnalyzer().review(good).some(f => f.rule === 'animation-layout-props')).toBe(false)
  })

  it('flags gap/flex and delayed layout animations too', () => {
    const gap = 'const s = useAnimatedStyle(() => ({ gap: withSpring(8) }))\n'
    expect(new CodeReviewAnalyzer().review(gap).some(f => f.rule === 'animation-layout-props')).toBe(true)
    const flex = 'const s = useAnimatedStyle(() => ({ flex: withTiming(1) }))\n'
    expect(new CodeReviewAnalyzer().review(flex).some(f => f.rule === 'animation-layout-props')).toBe(true)
    const delayed = 'const s = useAnimatedStyle(() => ({ top: withDelay(100, withTiming(0)) }))\n'
    expect(new CodeReviewAnalyzer().review(delayed).some(f => f.rule === 'animation-layout-props')).toBe(true)
  })

  it('flags JS-thread press callbacks only when the file animates', () => {
    const animated = '<Pressable onPressIn={() => {}} onPressOut={() => {}}>\n<Animated.View style={animatedStyle} />\n'
    expect(new CodeReviewAnalyzer().review(animated).some(f => f.rule === 'animation-press-gesture')).toBe(true)
    // Plain press handlers without animation are fine.
    const plain = '<Pressable onPressIn={() => {}}><Text>Hi</Text></Pressable>\n'
    expect(new CodeReviewAnalyzer().review(plain).some(f => f.rule === 'animation-press-gesture')).toBe(false)
  })

  it('filters LLM animation findings by their signals (no drift)', () => {
    const base: LLMCodeReview = { verdict: 'changes-requested', summary: 'x', findings: [], source: 'llm' }
    // animation-layout-props requires a layout prop wired to an animation fn.
    const noLayout = verifyLLMReview(
      { ...base, findings: [{ severity: 'warning' as const, rule: 'animation-layout-props', message: 'm', line: 1 }] },
      'const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 }] }))\n'
    )
    expect(noLayout.findings.length).toBe(0)
    const withGap = verifyLLMReview(
      { ...base, findings: [{ severity: 'warning' as const, rule: 'animation-layout-props', message: 'm', line: 1 }] },
      'const style = useAnimatedStyle(() => ({ gap: withTiming(8) }))\n'
    )
    expect(withGap.findings.length).toBe(1)
    // animation-press-gesture requires the animation token to coexist.
    const plainPress = verifyLLMReview(
      { ...base, findings: [{ severity: 'warning' as const, rule: 'animation-press-gesture', message: 'm', line: 1 }] },
      '<Pressable onPressIn={() => {}}><Text>Hi</Text></Pressable>\n'
    )
    expect(plainPress.findings.length).toBe(0)
    const animatedPress = verifyLLMReview(
      { ...base, findings: [{ severity: 'warning' as const, rule: 'animation-press-gesture', message: 'm', line: 1 }] },
      '<Pressable onPressIn={() => {}}>\n<Animated.View style={s} />\n'
    )
    expect(animatedPress.findings.length).toBe(1)
  })

  it('flags JS stack/bottom-tabs navigators (use native navigators)', () => {
    const js = "import { createStackNavigator } from '@react-navigation/stack'\n"
    expect(new CodeReviewAnalyzer().review(js).some(f => f.rule === 'navigation-native-stack')).toBe(true)
    const tabs = "import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'\n"
    expect(new CodeReviewAnalyzer().review(tabs).some(f => f.rule === 'navigation-native-stack')).toBe(true)
    const native = "import { createNativeStackNavigator } from '@react-navigation/native-stack'\n"
    expect(new CodeReviewAnalyzer().review(native).some(f => f.rule === 'navigation-native-stack')).toBe(false)
  })

  it('flags ScrollView with mapped children (virtualize with FlashList)', () => {
    const list = '<ScrollView>\n  {items.map(item => <Item key={item.id} />)}\n</ScrollView>\n'
    expect(new CodeReviewAnalyzer().review(list).some(f => f.rule === 'list-scrollview-map')).toBe(true)
    const virtualized = '<FlashList data={items} renderItem={renderItem} />\n'
    expect(new CodeReviewAnalyzer().review(virtualized).some(f => f.rule === 'list-scrollview-map')).toBe(false)
  })

  it('reports no findings for clean code', () => {
    expect(new CodeReviewAnalyzer().review('const x = 1\n')).toEqual([])
  })
})
