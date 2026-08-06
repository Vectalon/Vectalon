import { detectReactCompiler, isReact19, reactMajor } from '../../src/utils/reactCompiler'
import { createTempProject, cleanup } from '../helpers/tmp'

const PKG_WITH_REACT = {
  dependencies: { react: '19.1.0', 'react-native': '0.76.0' },
  devDependencies: {},
}

describe('reactMajor / isReact19', () => {
  it('parses version majors', () => {
    expect(reactMajor('19.1.0')).toBe(19)
    expect(reactMajor('^19.0.0')).toBe(19)
    expect(reactMajor('~18.3.1')).toBe(18)
    expect(reactMajor('')).toBeNull()
  })

  it('detects React 19+', () => {
    expect(isReact19('19.1.0')).toBe(true)
    expect(isReact19('^19.0.0')).toBe(true)
    expect(isReact19('18.3.1')).toBe(false)
    expect(isReact19('')).toBe(false)
  })
})

describe('detectReactCompiler', () => {
  it('detects the plugin from package.json', () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const info = detectReactCompiler(dir, {
        ...PKG_WITH_REACT,
        devDependencies: { 'babel-plugin-react-compiler': '^0.0.0-experimental-xyz' },
      })
      expect(info.enabled).toBe(true)
      expect(info.sources).toContain('package.json')
      expect(info.reactVersion).toBe('19.1.0')
    } finally {
      cleanup(dir)
    }
  })

  it('detects the plugin referenced from babel.config.js', () => {
    const dir = createTempProject({
      'package.json': '{}',
      'babel.config.js': "module.exports = { presets: ['module:@react-native/babel-preset'], plugins: ['babel-plugin-react-compiler'] }",
    })
    try {
      const info = detectReactCompiler(dir, PKG_WITH_REACT)
      expect(info.enabled).toBe(true)
      expect(info.sources).toEqual(['babel.config.js'])
    } finally {
      cleanup(dir)
    }
  })

  it('detects the compiler via eslint-plugin-react-compiler', () => {
    const dir = createTempProject({
      'package.json': '{}',
      'eslint.config.js': "module.exports = [ { plugins: ['react-compiler'] } ]",
    })
    try {
      const info = detectReactCompiler(dir, PKG_WITH_REACT)
      expect(info.enabled).toBe(true)
      expect(info.sources).toEqual(['eslint.config.js'])
    } finally {
      cleanup(dir)
    }
  })

  it('reports disabled when nothing references the compiler', () => {
    const dir = createTempProject({
      'package.json': '{}',
      'babel.config.js': "module.exports = { presets: ['module:@react-native/babel-preset'] }",
    })
    try {
      const info = detectReactCompiler(dir, PKG_WITH_REACT)
      expect(info.enabled).toBe(false)
      expect(info.reason).toContain('React 19')
    } finally {
      cleanup(dir)
    }
  })

  it('reports unknown React version when no react dependency exists', () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const info = detectReactCompiler(dir, { dependencies: {}, devDependencies: {} })
      expect(info.enabled).toBe(false)
      expect(info.reactVersion).toBe('')
    } finally {
      cleanup(dir)
    }
  })
})
