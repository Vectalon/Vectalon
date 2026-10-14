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
  it('offline queue serializes sends, rolls back failed increments and retries the same action on reconnection', async () => {
    type Entry = { id: string; type: string; payload: unknown; status: string }
    type Snapshot = { actions: Entry[]; isOnline: boolean }
    type Queue = { enqueue: (input: { type: string; payload: unknown }) => Entry; snapshot: () => Snapshot;
      pending: () => Entry[]; setOnline: (online: boolean) => void; retry: (id: string) => void;
      subscribe: (listener: () => void) => () => void }
    const { load, scenario, files } = referenceModules('rn-06-offline-queue')
    expect(scenario.expect.files.every(path => files.some(file => file.path === path))).toBe(true)
    const { ActionQueue } = load('src/store/queue.ts') as { ActionQueue: new (send: (entry: Entry) => Promise<void>) => Queue }
    let resolveFirst!: () => void
    const send = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = resolve }))
      .mockRejectedValueOnce(new Error('private transport error')).mockResolvedValue(undefined)
    const queue = new ActionQueue(send)
    const listener = jest.fn()
    const unsubscribe = queue.subscribe(listener)
    const first = queue.enqueue({ type: 'increment', payload: null })
    const second = queue.enqueue({ type: 'increment', payload: null })
    expect(first.id).not.toBe(second.id)
    expect(send).not.toHaveBeenCalled()
    const count = () => queue.snapshot().actions.filter(item => item.status !== 'failed').length
    expect(count()).toBe(2)
    const previous = queue.snapshot()
    queue.setOnline(true)
    queue.setOnline(true)
    expect(send).toHaveBeenCalledTimes(1)
    queue.retry(first.id)
    expect(send).toHaveBeenCalledTimes(1)
    resolveFirst()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(queue.snapshot().actions.map(item => item.status)).toEqual(['synced', 'failed'])
    expect(previous.actions.map(item => item.status)).toEqual(['pending', 'pending'])
    expect(count()).toBe(1)
    expect(queue.pending().map(item => item.id)).toEqual([second.id])
    expect(queue.snapshot().isOnline).toBe(true)
    queue.setOnline(true)
    expect(send).toHaveBeenCalledTimes(2)
    queue.setOnline(false)
    queue.setOnline(true)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(send.mock.calls.map(call => call[0].id)).toEqual([first.id, second.id, second.id])
    expect(count()).toBe(2)
    expect(queue.pending()).toEqual([])
    expect(JSON.stringify(queue.snapshot())).not.toContain('private transport error')
    unsubscribe()
    listener.mockClear()
    queue.setOnline(false)
    const third = queue.enqueue({ type: 'increment', payload: null })
    expect(listener).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(3)
    send.mockRejectedValueOnce(new Error('retryable'))
    queue.setOnline(true)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(queue.pending()[0].status).toBe('failed')
    queue.retry(third.id)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(send.mock.calls.slice(-2).map(call => call[0].id)).toEqual([third.id, third.id])
    expect(queue.pending()).toEqual([])
  })

  it('offline hook follows connectivity and removes both listeners on unmount', () => {
    let effect!: () => () => void
    let network!: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void
    let notify!: () => void
    const unsubscribeNetwork = jest.fn()
    const unsubscribeQueue = jest.fn()
    const setState = jest.fn()
    const queue = { snapshot: jest.fn(() => ({ actions: [], isOnline: false })), setOnline: jest.fn(),
      subscribe: jest.fn((listener: () => void) => { notify = listener; return unsubscribeQueue }) }
    const { load } = referenceModules('rn-06-offline-queue', {
      react: { useState: (initial: () => unknown) => [initial(), setState], useEffect: (callback: () => () => void) => { effect = callback } },
      '@react-native-community/netinfo': { default: { addEventListener: (listener: typeof network) => { network = listener; return unsubscribeNetwork } } },
    })
    const { useOfflineQueue } = load('src/hooks/useOfflineQueue.ts') as { useOfflineQueue: (queue: unknown) => unknown }
    useOfflineQueue(queue)
    const cleanup = effect()
    network({ isConnected: null, isInternetReachable: null })
    network({ isConnected: true, isInternetReachable: false })
    network({ isConnected: true, isInternetReachable: true })
    expect(queue.setOnline.mock.calls).toEqual([[false], [false], [true]])
    notify()
    expect(setState).toHaveBeenCalledTimes(2)
    cleanup()
    expect(unsubscribeNetwork).toHaveBeenCalledTimes(1)
    expect(unsubscribeQueue).toHaveBeenCalledTimes(1)
  })

  it('queue screen wires enqueue and retry and rolls back only failed increments', () => {
    type Element = { type: string; props: Record<string, unknown> }
    const element = (type: string, props: Record<string, unknown>): Element => ({ type, props })
    const state = { isOnline: false, actions: [
      { id: '1', type: 'increment', status: 'synced' },
      { id: '2', type: 'increment', status: 'pending' },
      { id: '3', type: 'increment', status: 'failed' },
    ] }
    const queue = { enqueue: jest.fn(), retry: jest.fn() }
    const { load } = referenceModules('rn-06-offline-queue', {
      '../hooks/useOfflineQueue': { useOfflineQueue: () => state },
      'react/jsx-runtime': { jsx: element, jsxs: element },
      'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', SafeAreaView: 'SafeAreaView',
        Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
    })
    const { QueueScreen } = load('src/screens/QueueScreen.tsx') as { QueueScreen: (props: { queue: unknown }) => Element }
    const children = QueueScreen({ queue }).props.children as Element[]
    expect(children[1].props.children).toEqual(['Demo counter: ', 2])
    const add = children.find(child => child.type === 'Pressable')!
    ;(add.props.onPress as () => void)()
    expect(queue.enqueue).toHaveBeenCalledWith({ type: 'increment', payload: null })
    const list = children.find(child => child.type === 'FlatList')!
    const row = (list.props.renderItem as (props: { item: unknown }) => Element)({ item: state.actions[2] })
    const retry = (row.props.children as Element[])[1]
    expect(retry.props.accessibilityRole).toBe('button')
    ;(retry.props.onPress as () => void)()
    expect(queue.retry).toHaveBeenCalledWith('3')
  })

  it('credential storage validates inputs, rejects native failures and clears the same service', async () => {
    const setGenericPassword = jest.fn().mockResolvedValue({ service: 'com.example.app.session' })
    const resetGenericPassword = jest.fn().mockResolvedValue(true)
    const { load } = referenceModules('rn-05-form-validation', {
      'react-native-keychain': { setGenericPassword, resetGenericPassword,
        ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked-device-only' } },
    })
    const { saveCredentials, clearCredentials } = load('src/services/storage.ts') as {
      saveCredentials: (email: string, password: string) => Promise<void>; clearCredentials: () => Promise<void>;
    }
    for (const [email, password] of [['bad', 'fixture-password'], ['a@example.com', 'short'],
      ['a@example.com trailing', 'fixture-password'], ['a@example.com', 'x'.repeat(1025)]]) {
      await expect(saveCredentials(email, password)).rejects.toThrow()
    }
    expect(setGenericPassword).not.toHaveBeenCalled()
    await saveCredentials('a@example.com', 'fixture-password')
    expect(setGenericPassword).toHaveBeenCalledWith('a@example.com', 'fixture-password', {
      service: 'com.example.app.session', accessible: 'unlocked-device-only',
    })
    setGenericPassword.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('sensitive native detail'))
    await expect(saveCredentials('a@example.com', 'fixture-password')).rejects.toThrow('Could not save credentials on this device')
    await expect(saveCredentials('a@example.com', 'fixture-password')).rejects.toThrow('Could not save credentials on this device')
    await clearCredentials()
    expect(resetGenericPassword).toHaveBeenCalledWith({ service: 'com.example.app.session' })
    resetGenericPassword.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('sensitive native detail'))
    await expect(clearCredentials()).rejects.toThrow('Could not clear credentials on this device')
    await expect(clearCredentials()).rejects.toThrow('Could not clear credentials on this device')
  })

  it('credential form validates, prevents overlapping saves, hides native errors and clears saved passwords', async () => {
    type Element = { type: string; props: Record<string, unknown> }
    const states: unknown[] = []
    const busy = { current: false }
    let stateIndex = 0
    let resolveSave!: () => void
    const setGenericPassword = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { resolveSave = resolve }))
    const element = (type: string, props: Record<string, unknown>): Element => ({ type, props })
    const { load, scenario, files } = referenceModules('rn-05-form-validation', {
      react: { useRef: () => busy, useState: (initial: unknown) => {
        const index = stateIndex++
        if (states.length <= index) states[index] = initial
        return [states[index], (value: unknown) => { states[index] = value }]
      } },
      'react-native-keychain': { setGenericPassword, ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked-device-only' } },
      'react/jsx-runtime': { jsx: element, jsxs: element },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      'react-native': { TextInput: 'TextInput', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
        KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, StyleSheet: { create: (styles: unknown) => styles } },
    })
    expect(scenario.expect.files.every(path => files.some(file => file.path === path))).toBe(true)
    const { ProfileFormScreen } = load('src/screens/ProfileFormScreen.tsx') as { ProfileFormScreen: () => Element }
    const render = () => { stateIndex = 0; return ProfileFormScreen() }
    function all(node: unknown, type: string): Element[] {
      if (!node || typeof node !== 'object') return []
      if (Array.isArray(node)) return node.flatMap(child => all(child, type))
      const child = node as Element
      return child.type === type ? [child] : all(child.props.children, type)
    }
    const submit = () => (all(render(), 'Pressable')[0].props.onPress as () => Promise<void>)()
    const input = (index: number, value: string) => (all(render(), 'TextInput')[index].props.onChangeText as (value: string) => void)(value)
    expect(all(render(), 'KeyboardAvoidingView')[0].props.behavior).toBe('padding')
    expect(all(render(), 'TextInput')[1].props.secureTextEntry).toBe(true)
    await submit()
    expect(setGenericPassword).not.toHaveBeenCalled()
    expect(all(render(), 'Text').some(node => node.props.children === 'Enter a valid email')).toBe(true)
    input(0, ' a@example.com ')
    input(1, 'fixture-password')
    const pending = submit()
    await submit()
    expect(setGenericPassword).toHaveBeenCalledTimes(1)
    expect(setGenericPassword.mock.calls[0].slice(0, 2)).toEqual(['a@example.com', 'fixture-password'])
    expect(all(render(), 'TextInput').every(node => node.props.editable === false)).toBe(true)
    resolveSave()
    await pending
    expect(all(render(), 'TextInput')[1].props.value).toBe('')
    expect(all(render(), 'Text').some(node => node.props.children === 'Credentials saved on this device.')).toBe(true)
    input(1, 'fixture-password')
    setGenericPassword.mockRejectedValueOnce(new Error('sensitive native detail'))
    await submit()
    expect(JSON.stringify(render())).not.toContain('sensitive native detail')
    expect(all(render(), 'Text').some(node => node.props.children === 'Could not save credentials on this device. Please retry.')).toBe(true)
    expect(all(render(), 'Pressable')[0].props.disabled).toBe(false)
  })

  it('image feed uses fixture posts, cached images, a real error fallback and matching scaled row layouts', () => {
    type Element = { type: unknown; key?: string; props: Record<string, unknown> }
    type Post = { id: string; title: string; imageUrl: string }
    const element = (type: unknown, props: Record<string, unknown>, key?: string): Element => ({ type, props, key })
    let failed = false
    let fontScale = 1
    const memo = jest.fn(component => component)
    const FastImage = { cacheControl: { web: 'web' }, resizeMode: { cover: 'cover' } }
    const { load, scenario, files } = referenceModules('rn-07-image-feed', {
      react: { memo, useCallback: (callback: unknown) => callback,
        useState: () => [failed, (value: boolean) => { failed = value }] },
      'react/jsx-runtime': { jsx: element, jsxs: element },
      'react-native-fast-image': { default: FastImage },
      'react-native': { FlatList: 'FlatList', SafeAreaView: 'SafeAreaView', Text: 'Text', View: 'View',
        useWindowDimensions: () => ({ fontScale }), StyleSheet: { create: (styles: unknown) => styles } },
    })
    expect(scenario.expect.files.every(path => files.some(file => file.path === path))).toBe(true)
    const { FeedScreen } = load('src/screens/FeedScreen.tsx') as { FeedScreen: () => Element }
    const { FeedRow } = load('src/components/FeedRow.tsx') as { FeedRow: (props: Record<string, unknown>) => Element }
    expect(memo).toHaveBeenCalledTimes(1)
    for (fontScale of [1, 2, 3]) {
      const list = FeedScreen().props.children as Element
      const data = list.props.data as Post[]
      expect(data).toHaveLength(50)
      expect((list.props.keyExtractor as (post: Post) => string)(data[0])).toBe('post-0')
      const row = FeedRow({ item: data[0] })
      const height = (row.props.style as Array<{ height: number }>)[1].height
      expect((list.props.getItemLayout as (data: null, index: number) => unknown)(null, 4)).toEqual({ length: height, offset: height * 4, index: 4 })
      expect(list.props.extraData).toBe(fontScale)
      const thumbnail = (row.props.children as Element[])[0]
      expect(thumbnail.key).toBe('https://images.example.com/0.jpg')
      const renderThumbnail = thumbnail.type as (props: Record<string, unknown>) => Element
      failed = false
      const image = renderThumbnail(thumbnail.props)
      expect(image.props.source).toEqual({ uri: thumbnail.key, cache: 'web' })
      expect(image.props.accessibilityLabel).toBe('Post 0')
      ;(image.props.onError as () => void)()
      expect((renderThumbnail(thumbnail.props).props.children as Element).props.children).toBe('Image unavailable')
      const changed = FeedRow({ item: { ...data[0], imageUrl: 'https://images.example.com/replaced.jpg' } })
      expect((changed.props.children as Element[])[0].key).not.toBe(thumbnail.key)
    }
  })

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
