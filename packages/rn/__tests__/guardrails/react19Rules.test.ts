import { runGuardrails } from '../../src/guardrails'
import type { ReactCompilerInfo } from '../../src/utils/reactCompiler'

const COMPILER_ON: ReactCompilerInfo = {
  enabled: true,
  sources: ['babel.config.js'],
  reason: 'compiler on',
  reactVersion: '19.1.0',
}

const COMPILER_OFF: ReactCompilerInfo = {
  enabled: false,
  sources: [],
  reason: 'compiler off',
  reactVersion: '18.3.1',
}

function finding(result: { findings: Array<{ rule: string; passed: boolean; message?: string }> }, name: string) {
  return result.findings.find(f => f.rule === name)
}

describe('no-ref-mutation-in-render', () => {
  const name = 'Refs are not mutated during render'

  it('flags ref.current assignment in the render body', () => {
    const result = runGuardrails({
      filePath: 'src/components/Counter.tsx',
      content: [
        'export function Counter() {',
        '  const ref = useRef(0);',
        '  ref.current = ref.current + 1;',
        '  return <Text>{ref.current}</Text>;',
        '}',
      ].join('\n'),
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('allows ref mutation inside useEffect', () => {
    const result = runGuardrails({
      filePath: 'src/components/Counter.tsx',
      content: [
        'export function Counter() {',
        '  const ref = useRef(0);',
        '  useEffect(() => {',
        '    ref.current = 1;',
        '  }, []);',
        '  return <Text>hi</Text>;',
        '}',
      ].join('\n'),
    })
    expect(finding(result, name)?.passed).toBe(true)
  })

  it('ignores .current reads and non-assignment usage', () => {
    const result = runGuardrails({
      filePath: 'src/components/View.tsx',
      content: 'export function View() { const ref = useRef(null); return <Text>{ref.current === null ? "x" : "y"}</Text>; }',
    })
    expect(finding(result, name)?.passed).toBe(true)
  })
})

describe('use-effect-cleanup', () => {
  const name = 'useEffect subscriptions return cleanup'

  it('flags a setInterval with no cleanup', () => {
    const result = runGuardrails({
      filePath: 'src/hooks/useTick.ts',
      content: [
        'useEffect(() => {',
        '  setInterval(() => setCount(c => c + 1), 1000);',
        '}, []);',
      ].join('\n'),
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('allows a timer with cleanup', () => {
    const result = runGuardrails({
      filePath: 'src/hooks/useTick.ts',
      content: [
        'useEffect(() => {',
        '  const id = setInterval(() => setCount(c => c + 1), 1000);',
        '  return () => clearInterval(id);',
        '}, []);',
      ].join('\n'),
    })
    expect(finding(result, name)?.passed).toBe(true)
  })

  it('flags an event listener without cleanup and allows one with removeEventListener', () => {
    const leaky = runGuardrails({
      filePath: 'src/hooks/useKey.ts',
      content: "useEffect(() => { window.addEventListener('keydown', onKey); }, []);",
    })
    expect(finding(leaky, name)?.passed).toBe(false)

    const clean = runGuardrails({
      filePath: 'src/hooks/useKey.ts',
      content: [
        'useEffect(() => {',
        "  window.addEventListener('keydown', onKey);",
        "  return () => window.removeEventListener('keydown', onKey);",
        '}, []);',
      ].join('\n'),
    })
    expect(finding(clean, name)?.passed).toBe(true)
  })

  it('passes effects with no subscription', () => {
    const result = runGuardrails({
      filePath: 'src/hooks/useTitle.ts',
      content: "useEffect(() => { document.title = 'x'; }, []);",
    })
    expect(finding(result, name)?.passed).toBe(true)
  })
})

describe('use-outside-suspense', () => {
  const name = 'use() is inside a Suspense boundary'

  it('flags use() without a Suspense boundary', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Profile.tsx',
      content: [
        "import { use } from 'react';",
        "import { fetchUser } from '../api';",
        'export function Profile({ userId }: { userId: string }) {',
        '  const user = use(fetchUser(userId));',
        '  return <Text>{user.name}</Text>;',
        '}',
      ].join('\n'),
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('passes when a Suspense boundary is present', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Profile.tsx',
      content: [
        "import { Suspense, use } from 'react';",
        "import { fetchUser } from '../api';",
        'export function Profile({ userId }: { userId: string }) {',
        '  const user = use(fetchUser(userId));',
        '  return <Suspense fallback={null}><Text>{user.name}</Text></Suspense>;',
        '}',
      ].join('\n'),
    })
    expect(finding(result, name)?.passed).toBe(true)
  })

  it('does not fire when use is not imported from react', () => {
    const result = runGuardrails({
      filePath: 'src/utils/format.ts',
      content: 'export function use(n: number) { return n * 2; }',
    })
    expect(finding(result, name)).toBeUndefined()
  })
})

describe('unstable-dependency-array', () => {
  const name = 'Dependency arrays are stable'

  it('flags an inline function in a deps array', () => {
    const result = runGuardrails({
      filePath: 'src/hooks/useX.ts',
      content: 'useEffect(() => doThing(), [() => 1]);',
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('flags a derived call result in a deps array', () => {
    const result = runGuardrails({
      filePath: 'src/hooks/useX.ts',
      content: 'useMemo(() => compute(), [items.filter(i => i.active)]);',
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('passes stable identifier deps', () => {
    const result = runGuardrails({
      filePath: 'src/hooks/useX.ts',
      content: 'useEffect(() => run(userId), [userId]);',
    })
    expect(finding(result, name)?.passed).toBe(true)
  })
})

describe('no-forward-ref', () => {
  const name = 'React 19 uses ref as a prop instead of forwardRef'

  it('flags forwardRef on React 19', () => {
    const result = runGuardrails({
      filePath: 'src/components/Input.tsx',
      content: 'const Input = forwardRef((props, ref) => <TextInput ref={ref} {...props} />);',
      conventions: { reactVersion: '19.1.0' },
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('is skipped on React 18', () => {
    const result = runGuardrails({
      filePath: 'src/components/Input.tsx',
      content: 'const Input = forwardRef((props, ref) => <TextInput ref={ref} {...props} />);',
      conventions: { reactVersion: '18.3.1' },
    })
    expect(finding(result, name)).toBeUndefined()
  })

  it('is skipped when the React version is unknown', () => {
    const result = runGuardrails({
      filePath: 'src/components/Input.tsx',
      content: 'const Input = forwardRef((props, ref) => <TextInput ref={ref} {...props} />);',
    })
    expect(finding(result, name)).toBeUndefined()
  })
})

describe('compiler-auto-memoization', () => {
  const name = 'React Compiler auto-memoizes — avoid manual memoization'

  it('flags manual useMemo when the compiler is enabled', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Home.tsx',
      content: 'const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);',
      conventions: { reactCompiler: COMPILER_ON },
    })
    expect(finding(result, name)?.passed).toBe(false)
  })

  it('is skipped when the compiler is disabled', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Home.tsx',
      content: 'const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);',
      conventions: { reactCompiler: COMPILER_OFF },
    })
    expect(finding(result, name)).toBeUndefined()
  })

  it('is skipped when there is no manual memoization', () => {
    const result = runGuardrails({
      filePath: 'src/screens/Home.tsx',
      content: 'export function Home() { return <Text>hi</Text>; }',
      conventions: { reactCompiler: COMPILER_ON },
    })
    expect(finding(result, name)).toBeUndefined()
  })
})
