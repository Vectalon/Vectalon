import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PNG } from 'pngjs'
import { ReferenceStore, referenceDir, isValidReferenceKey } from '../../src/utils/referenceStore'

function writePng(dir: string, name: string): string {
  const png = new PNG({ width: 4, height: 4 })
  for (let i = 0; i < 16; i++) {
    png.data[i * 4] = 10
    png.data[i * 4 + 1] = 20
    png.data[i * 4 + 2] = 30
    png.data[i * 4 + 3] = 255
  }
  const path = join(dir, name)
  writeFileSync(path, PNG.sync.write(png))
  return path
}

describe('ReferenceStore', () => {
  let root: string
  let store: ReferenceStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vectalon-ref-'))
    store = new ReferenceStore(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('saves a reference by copying the image and updating the manifest', () => {
    const source = writePng(root, 'source.png')
    const entry = store.save('LoginScreen', source, { platform: 'ios', source: 'figma export', capturedAt: 1000 })
    expect(entry).not.toBeNull()
    expect(entry!.key).toBe('LoginScreen')
    expect(entry!.path).toBe(join(referenceDir(root), 'LoginScreen-ios.png'))
    expect(existsSync(entry!.path)).toBe(true)
    // The stored file is a copy, not the source.
    expect(entry!.path).not.toBe(source)

    const manifest = JSON.parse(readFileSync(join(referenceDir(root), 'references.json'), 'utf-8'))
    expect(manifest.screens.LoginScreen.platform).toBe('ios')
    expect(manifest.screens.LoginScreen.source).toBe('figma export')
  })

  it('resolves persisted relative paths against the project root', () => {
    const source = writePng(root, 'source.png')
    store.save('Home', source, { platform: 'android', source: 'device capture', capturedAt: 2000 })
    const found = store.get('Home')
    expect(found).not.toBeNull()
    expect(found!.path.startsWith(root)).toBe(true)
    expect(existsSync(found!.path)).toBe(true)
  })

  it('lists references newest first and filters by platform', () => {
    const source = writePng(root, 'source.png')
    store.save('Old', source, { platform: 'ios', source: 'a', capturedAt: 100 })
    store.save('New', source, { platform: 'android', source: 'b', capturedAt: 300 })
    store.save('Mid', source, { platform: 'ios', source: 'c', capturedAt: 200 })

    const all = store.list()
    expect(all.map(e => e.key)).toEqual(['New', 'Mid', 'Old'])
    expect(store.latest('ios')!.key).toBe('Mid')
    expect(store.latest('android')!.key).toBe('New')
    expect(store.latest()!.key).toBe('New')
  })

  it('removes a reference and its stored image', () => {
    const source = writePng(root, 'source.png')
    const entry = store.save('Gone', source, { platform: 'ios', source: 'a', capturedAt: 100 })!
    expect(store.remove('Gone')).toBe(true)
    expect(store.get('Gone')).toBeNull()
    expect(existsSync(entry.path)).toBe(false)
    expect(store.remove('Gone')).toBe(false)
  })

  it('rejects invalid keys and missing sources', () => {
    const source = writePng(root, 'source.png')
    expect(isValidReferenceKey('LoginScreen')).toBe(true)
    expect(isValidReferenceKey('a-b_c.1')).toBe(true)
    expect(isValidReferenceKey('../evil')).toBe(false)
    expect(isValidReferenceKey('a/b')).toBe(false)
    expect(isValidReferenceKey('')).toBe(false)
    expect(store.save('bad/key', source, { platform: 'ios', source: 'a', capturedAt: 1 })).toBeNull()
    expect(store.save('Fine', join(root, 'nope.png'), { platform: 'ios', source: 'a', capturedAt: 1 })).toBeNull()
  })

  it('overwrites an existing reference for the same key', () => {
    const a = writePng(root, 'a.png')
    const b = writePng(root, 'b.png')
    store.save('Key', a, { platform: 'ios', source: 'first', capturedAt: 100 })
    const second = store.save('Key', b, { platform: 'ios', source: 'second', capturedAt: 200 })!
    expect(second.source).toBe('second')
    expect(store.get('Key')!.source).toBe('second')
  })
})
