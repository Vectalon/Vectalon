import { posix } from 'path'
import { runInNewContext } from 'vm'
import ts from 'typescript'
import { loadReferences, loadScenarios, runScenario } from '../../src/bench'

// Only checked-in reference code is evaluated; imports must resolve inside its fixture or explicit mocks.
function referenceModules(id: string, mocks: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const scenario = loadScenarios().scenarios.find(item => item.id === id)!
  const files = loadReferences().references.get(id)!
  const sources = { ...scenario.fixtures, ...Object.fromEntries(files.map(file => [file.path, file.content])) }
  const cache = new Map<string, { exports: Record<string, unknown> }>()
  function load(path: string): Record<string, unknown> {
    const cached = cache.get(path)
    if (cached) return cached.exports
    if (!(path in sources)) throw new Error(`Missing reference module: ${path}`)
    const module = { exports: {} as Record<string, unknown> }
    cache.set(path, module)
    const code = ts.transpileModule(sources[path], {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    runInNewContext(code, { ...globals, module, exports: module.exports, require: (id: string) => {
      if (id in mocks) return mocks[id]
      if (!id.startsWith('.')) throw new Error(`Unexpected reference dependency: ${id}`)
      const target = posix.normalize(posix.join(posix.dirname(path), id))
      const resolved = ['', '.ts', '.tsx', '.js', '/index.ts'].map(extension => target + extension).find(file => file in sources)
      if (!resolved) throw new Error(`Unresolved reference import: ${id}`)
      return load(resolved)
    } })
    return module.exports
  }
  return { load, scenario, files }
}

describe('repaired reference behavior', () => {
  it('list service uses the fixture endpoint and rejects bad responses and invalid pages', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [{ id: '1', title: 'One' }] })
    const { load } = referenceModules('rn-02-flatlist-fetch', {}, { fetch })
    const { fetchItems } = load('src/services/items.ts') as { fetchItems: (page: number) => Promise<unknown> }
    await expect(fetchItems(2)).resolves.toEqual([{ id: '1', title: 'One' }])
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/items?page=2&size=20')
    await expect(fetchItems(0)).rejects.toThrow('Invalid page')
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(fetchItems(1)).rejects.toThrow('Request failed: 503')
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1, title: 'Invalid' }] })
    await expect(fetchItems(1)).rejects.toThrow('Invalid items response')
  })

  it('list serializes page loads, retries failed pages, and refreshes back to page one', async () => {
    type Item = { id: string; title: string }
    type Element = { type: string; props: Record<string, unknown> }
    const states: unknown[] = []
    const refs: Array<{ current: unknown }> = []
    const effects: Array<() => () => void> = []
    let stateIndex = 0
    let refIndex = 0
    let resolvePage!: (items: Item[]) => void
    const fetchItems = jest.fn().mockImplementationOnce(() => new Promise<Item[]>(resolve => { resolvePage = resolve }))
    const element = (type: string, props: Record<string, unknown>): Element => ({ type, props })
    const { load } = referenceModules('rn-02-flatlist-fetch', {
      react: {
        useState: (initial: unknown) => {
          const index = stateIndex++
          if (states.length <= index) states[index] = initial
          return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        },
        useRef: (initial: unknown) => { const index = refIndex++; return refs[index] ??= { current: initial } },
        useCallback: (callback: unknown) => callback,
        useEffect: (effect: () => () => void) => { effects.push(effect) },
      },
      '../services/items': { fetchItems, PAGE_SIZE: 20 },
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
      'react-native': { ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', Pressable: 'Pressable',
        SafeAreaView: 'SafeAreaView', Text: 'Text', StyleSheet: { create: (styles: unknown) => styles } },
    })
    const { ListScreen } = load('src/screens/ListScreen.tsx') as { ListScreen: () => Element }
    const render = () => { stateIndex = 0; refIndex = 0; return ListScreen() }
    function find(node: unknown, type: string): Element | undefined {
      if (!node || typeof node !== 'object') return undefined
      if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean)
      const child = node as Element
      return child.type === type ? child : find(child.props.children, type)
    }
    const invoke = (type: string, handler: string) => (find(render(), type)!.props[handler] as () => void)()
    const settle = () => new Promise<void>(resolve => setImmediate(resolve))
    render()
    const cleanup = effects[0]()
    invoke('FlatList', 'onEndReached')
    expect(fetchItems).toHaveBeenCalledTimes(1)
    resolvePage(Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: String(i) })))
    await settle()
    fetchItems.mockRejectedValueOnce(new Error('Network failed'))
    invoke('FlatList', 'onEndReached')
    await settle()
    expect(find(render(), 'FlatList')!.props.data).toHaveLength(20)
    fetchItems.mockResolvedValueOnce([{ id: '20', title: 'Last' }])
    invoke('Pressable', 'onPress')
    await settle()
    expect(fetchItems.mock.calls.map(call => call[0])).toEqual([1, 2, 2])
    expect(find(render(), 'FlatList')!.props.data).toHaveLength(21)
    invoke('FlatList', 'onEndReached')
    expect(fetchItems).toHaveBeenCalledTimes(3)
    fetchItems.mockResolvedValueOnce([])
    invoke('FlatList', 'onRefresh')
    await settle()
    expect(fetchItems).toHaveBeenLastCalledWith(1)
    expect(find(render(), 'FlatList')!.props.data).toEqual([])
    cleanup()
  })

  it('feature flags preserve the supplied config and render deterministic children or fallback', async () => {
    const { load, scenario, files } = referenceModules('rn-08-feature-flags')
    expect(files.some(file => file.path === 'src/config/flags.ts')).toBe(false)
    const { FeatureFlag } = load('src/components/FeatureFlag.tsx') as {
      FeatureFlag: (props: { flag: string; children: string; fallback?: string }) => string | null;
    }
    for (let i = 0; i < 10; i++) {
      expect(FeatureFlag({ flag: 'newOnboarding', children: 'enabled', fallback: 'disabled' })).toBe('enabled')
      expect(FeatureFlag({ flag: 'darkMode', children: 'enabled', fallback: 'disabled' })).toBe('disabled')
    }
    expect(FeatureFlag({ flag: 'betaPayments', children: 'enabled' })).toBeNull()
    expect(FeatureFlag({ flag: 'unknown', children: 'enabled', fallback: 'closed' })).toBe('closed')
    const result = await runScenario(scenario, { generate: () => files })
    // No generic rubric rule applies to this non-visual wrapper; behavior is checked above.
    expect(result.axes).toEqual({ correctness: null, adherence: null, guardrails: 1 })
  })

  it('Profile preserves initial-name behavior and old default imports without a self-import loop', async () => {
    let storedName: string | undefined
    const element = (type: string, props: unknown) => ({ type, props })
    const { load, scenario, files } = referenceModules('rn-10-refactor-hooks-ts', {
      react: { useState: (initial: () => string) => { storedName ??= initial(); return [storedName] } },
      'react/jsx-runtime': { jsx: element, jsxs: element },
      'react-native': { Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
    })
    const { Profile } = load('src/components/Profile.tsx') as {
      Profile: (props: { name?: string }) => { props: { children: { props: { children: string[] } } } };
    }
    expect(Profile({ name: 'Ada' }).props.children.props.children).toEqual(['Hello ', 'Ada'])
    expect(Profile({ name: 'Changed' }).props.children.props.children).toEqual(['Hello ', 'Ada'])
    storedName = undefined
    expect(Profile({}).props.children.props.children).toEqual(['Hello ', 'Guest'])
    storedName = undefined
    expect(Profile({ name: '' }).props.children.props.children).toEqual(['Hello ', 'Guest'])
    expect(load('src/components/Profile.js').default).toBe(Profile)
    const result = await runScenario(scenario, { generate: () => files })
    expect(result.axes).toEqual({ correctness: null, adherence: 1, guardrails: 1 })
  })
})
