import { renderInSandbox } from '../../src/render/run'

describe('renderInSandbox', () => {
  it('compiles and headlessly renders a component with a JSON tree', async () => {
    const result = await renderInSandbox({
      files: [
        { path: 'src/App.tsx', content: 'import { View, Text } from "react-native"; export default function App() { return <View style={{flex:1}}><Text>Hello Vectalon</Text></View> }' },
      ],
      entry: 'src/App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    expect(result.transpiler).not.toBe('none')
    expect(result.renderer).toBe('shim')
    expect(result.tree).toBeTruthy()
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Text')
    expect(flat).toContain('Hello Vectalon')
  })

  it('renders multiple files with relative imports', async () => {
    const result = await renderInSandbox({
      files: [
        { path: 'src/Header.tsx', content: 'import { Text } from "react-native"; export default function Header() { return <Text>Header</Text> }' },
        {
          path: 'src/App.tsx',
          content: 'import { View } from "react-native"; import Header from "./Header"; export default function App() { return <View><Header /></View> }',
        },
      ],
      entry: 'src/App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const flat = JSON.stringify(result.tree)
    expect(flat).toContain('Header')
  })

  it('captures console.log and console.warn from the component', async () => {
    const result = await renderInSandbox({
      files: [
        { path: 'src/App.tsx', content: 'import { Text } from "react-native"; export default function App() { console.log("mount"); console.warn("deprecated"); return <Text>ok</Text> }' },
      ],
      entry: 'src/App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    const messages = result.logs.map(l => l.message)
    expect(messages.some(m => m.includes('mount'))).toBe(true)
    expect(messages.some(m => m.includes('deprecated'))).toBe(true)
    expect(result.logs.some(l => l.level === 'log')).toBe(true)
    expect(result.logs.some(l => l.level === 'warn')).toBe(true)
  })

  it('surfaces a runtime error thrown during render', async () => {
    const result = await renderInSandbox({
      files: [
        { path: 'src/App.tsx', content: 'import { Text } from "react-native"; export default function App() { throw new Error("boom at render"); return <Text>x</Text> }' },
      ],
      entry: 'src/App.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(false)
    expect(result.runtimeError).toContain('boom at render')
  })

  it('reports a missing entry with a loadError', async () => {
    const result = await renderInSandbox({
      files: [{ path: 'src/App.tsx', content: 'import { Text } from "react-native"; export default function App() { return <Text>hi</Text> }' }],
      entry: 'src/Nope.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(false)
    expect(result.loadError).toBeTruthy()
  })

  it('supports useState hooks during render', async () => {
    const result = await renderInSandbox({
      files: [
        {
          path: 'src/Counter.tsx',
          content: 'import { Text } from "react-native"; import { useState } from "react"; export default function Counter() { const [n] = useState(3); return <Text>{n}</Text> }',
        },
      ],
      entry: 'src/Counter.tsx',
      timeoutMs: 15_000,
    })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result.tree)).toContain('3')
  })

  it('rejects path traversal in file paths', async () => {
    await expect(
      renderInSandbox({
        files: [{ path: '../../etc/passwd', content: 'export default 1' }],
        entry: '../../etc/passwd',
        timeoutMs: 5_000,
      })
    ).rejects.toThrow(/traversal|relative/)
  })
})
