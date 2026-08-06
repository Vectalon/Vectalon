import {
  NativeModuleGenerator,
  parseNativeModuleSpec,
  defaultPackageName,
} from '../../src/sdlc/NativeModuleGenerator'

const SPEC = JSON.stringify({
  moduleName: 'CameraScanner',
  packageName: 'com.example.camerascanner',
  constants: { VERSION: '1.0.0', DEFAULT_MODE: 'auto' },
  events: ['onScanResult', 'onScanError'],
  methods: [
    { name: 'startScan', params: [], returnType: 'promise<string>' },
    { name: 'scan', params: [{ name: 'data', type: 'object' }], returnType: 'promise<boolean>' },
    { name: 'getStatus', params: [], returnType: 'string' },
    { name: 'setMode', params: [{ name: 'mode', type: 'string' }], returnType: 'void' },
    { name: 'setConfig', params: [{ name: 'config', type: 'object' }], returnType: 'boolean' },
  ],
  component: {
    name: 'CameraView',
    props: [
      { name: 'title', type: 'string' },
      { name: 'enabled', type: 'boolean' },
    ],
    events: ['onScanResult'],
  },
})

describe('NativeModuleGenerator', () => {
  describe('parseNativeModuleSpec', () => {
    it('parses a JSON string spec', () => {
      const spec = parseNativeModuleSpec(SPEC)
      expect(spec.moduleName).toBe('CameraScanner')
      expect(spec.methods).toHaveLength(5)
      expect(spec.component?.name).toBe('CameraView')
      expect(spec.constants?.VERSION).toBe('1.0.0')
    })

    it('accepts a plain object spec', () => {
      const spec = parseNativeModuleSpec({ moduleName: 'Battery' })
      expect(spec.moduleName).toBe('Battery')
      expect(spec.packageName).toBe('com.battery')
      expect(spec.methods).toEqual([])
    })

    it('derives a default java package and rejects a missing module name', () => {
      expect(defaultPackageName('CameraScanner')).toBe('com.camerascanner')
      expect(() => parseNativeModuleSpec('{ "methods": [] }')).toThrow(/moduleName/)
      expect(() => parseNativeModuleSpec('not json')).toThrow(/Invalid native module spec/)
    })
  })

  describe('bare RN CLI stack', () => {
    const result = new NativeModuleGenerator().generate(SPEC, { api: 'rn-cli' })

    it('generates the full file set', () => {
      const paths = result.files.map(f => f.path)
      expect(paths).toEqual(
        expect.arrayContaining([
          'src/specs/NativeCameraScanner.ts',
          'ios/CameraScanner.h',
          'ios/CameraScanner.mm',
          'android/src/main/java/com/example/camerascanner/CameraScannerModule.kt',
          'android/src/main/java/com/example/camerascanner/CameraScannerPackage.kt',
          'src/specs/CameraViewNativeComponent.ts',
          'ios/CameraViewManager.mm',
          'android/src/main/java/com/example/camerascanner/CameraViewManager.kt',
          'CameraScanner.podspec',
          'android/build.gradle',
          'react-native.config.js',
        ])
      )
    })

    it('generates a typed TurboModule spec with methods, constants, and events', () => {
      const ts = result.files.find(f => f.path === 'src/specs/NativeCameraScanner.ts')!.content
      expect(ts).toContain('export interface Spec extends TurboModule {')
      expect(ts).toContain("TurboModuleRegistry.getEnforcing<Spec>('CameraScanner')")
      expect(ts).toContain('startScan(): Promise<string>')
      expect(ts).toContain('scan(data: Record<string, unknown>): Promise<boolean>')
      expect(ts).toContain('setMode(mode: string): void')
      expect(ts).toContain('readonly VERSION: string')
      expect(ts).toContain('addListener(eventName: string): void')
    })

    it('generates iOS ObjC++ bindings with promise handlers and events', () => {
      const mm = result.files.find(f => f.path === 'ios/CameraScanner.mm')!.content
      expect(mm).toContain('@implementation CameraScanner')
      expect(mm).toContain('RCT_EXPORT_MODULE(CameraScanner)')
      expect(mm).toContain('startScan')
      expect(mm).toContain('resolve:(RCTPromiseResolveBlock)resolve')
      expect(mm).toContain('supportedEvents')
      expect(mm).toContain('@"onScanResult"')
    })

    it('generates the Android Kotlin module and package', () => {
      const module = result.files.find(f => f.path.endsWith('CameraScannerModule.kt'))!.content
      expect(module).toContain('package com.example.camerascanner')
      expect(module).toContain('@ReactModule(name = CameraScannerModule.NAME)')
      expect(module).toContain('const val VERSION = "1.0.0"')
      expect(module).toContain('fun startScan(promise: Promise)')
      expect(module).toContain('fun scan(data: ReadableMap, promise: Promise)')
      expect(module).toContain('fun setMode(mode: String)')
      expect(module).toContain('fun setConfig(config: ReadableMap)')
      expect(module).toContain('getConstants()')

      const pkg = result.files.find(f => f.path.endsWith('CameraScannerPackage.kt'))!.content
      expect(pkg).toContain('class CameraScannerPackage : ReactPackage {')
      expect(pkg).toContain('listOf(CameraViewManager())')
    })

    it('generates podspec, build.gradle, and codegen config', () => {
      const podspec = result.files.find(f => f.path === 'CameraScanner.podspec')!.content
      expect(podspec).toContain('s.name            = "CameraScanner"')
      expect(podspec).toContain('s.source_files    = "ios/**/*.{h,m,mm}"')
      expect(podspec).toContain('s.dependency "React-Core"')

      const gradle = result.files.find(f => f.path === 'android/build.gradle')!.content
      expect(gradle).toContain('apply plugin: "com.android.library"')
      expect(gradle).toContain('implementation "com.facebook.react:react-android"')

      const codegen = result.files.find(f => f.path === 'react-native.config.js')!.content
      expect(codegen).toContain('codegenConfig')
      expect(codegen).toContain("name: 'CameraScannerSpec'")
      expect(codegen).toContain("javaPackageName: 'com.example.camerascanner'")
    })

    it('scaffolds the Fabric component (TS spec, iOS view manager, Android manager)', () => {
      const ts = result.files.find(f => f.path === 'src/specs/CameraViewNativeComponent.ts')!.content
      expect(ts).toContain("codegenNativeComponent<NativeProps>('CameraView')")
      expect(ts).toContain('title?: string')
      expect(ts).toContain('enabled?: boolean')

      const ios = result.files.find(f => f.path === 'ios/CameraViewManager.mm')!.content
      expect(ios).toContain('RCT_EXPORT_MODULE(CameraView)')
      expect(ios).toContain('RCT_EXPORT_VIEW_PROPERTY(title, NSString *)')

      const android = result.files.find(f => f.path.endsWith('CameraViewManager.kt'))!.content
      expect(android).toContain('class CameraViewManager : SimpleViewManager<CameraView>()')
      expect(android).toContain('@ReactProp(name = "enabled")')
    })

    it('provides install steps and honest New Architecture notes', () => {
      expect(result.install.some(s => s.includes('pod install'))).toBe(true)
      expect(result.notes.some(n => n.includes('sync return types'))).toBe(true)
    })
  })

  describe('Expo Modules API', () => {
    const result = new NativeModuleGenerator().generate(SPEC, { api: 'expo' })

    it('generates the modules/<name>/ layout', () => {
      const paths = result.files.map(f => f.path)
      expect(paths).toEqual(
        expect.arrayContaining([
          'modules/camera-scanner/package.json',
          'modules/camera-scanner/src/index.ts',
          'modules/camera-scanner/android/src/main/java/expo/modules/camerascanner/CameraScannerModule.kt',
          'modules/camera-scanner/ios/CameraScanner.swift',
          'modules/camera-scanner/expo-module.config.json',
        ])
      )
    })

    it('exports the native module through requireNativeModule', () => {
      const ts = result.files.find(f => f.path.endsWith('src/index.ts'))!.content
      expect(ts).toContain("import { requireNativeModule } from 'expo-modules-core'")
      expect(ts).toContain("requireNativeModule<CameraScannerModule>('CameraScanner')")
    })

    it('generates the Kotlin Module definition with AsyncFunction/Function/Events', () => {
      const kotlin = result.files.find(f => f.path.endsWith('CameraScannerModule.kt'))!.content
      expect(kotlin).toContain('package expo.modules.camerascanner')
      expect(kotlin).toContain('class CameraScannerModule : Module() {')
      expect(kotlin).toContain('AsyncFunction("startScan")')
      expect(kotlin).toContain('Function("getStatus")')
      expect(kotlin).toContain('Events("onScanResult", "onScanError")')
      expect(kotlin).toContain('View(CameraView::class)')
      expect(kotlin).toContain('Prop("enabled")')
    })

    it('generates the Swift Module definition', () => {
      const swift = result.files.find(f => f.path.endsWith('CameraScanner.swift'))!.content
      expect(swift).toContain('public class CameraScannerModule: Module {')
      expect(swift).toContain('AsyncFunction("startScan")')
      expect(swift).toContain('Constants([')
      expect(swift).toContain('Events("onScanResult", "onScanError")')
    })

    it('writes an autolinking expo-module.config.json', () => {
      const config = JSON.parse(result.files.find(f => f.path.endsWith('expo-module.config.json'))!.content)
      expect(config.platforms).toContain('android')
      expect(config.android.modules).toContain('expo.modules.camerascanner.CameraScannerModule')
      expect(config.apple.modules).toContain('CameraScannerModule')
    })

    it('renders a markdown manifest with all files and install steps', () => {
      const render = new NativeModuleGenerator().render(result)
      expect(render).toContain('# Native module scaffold: CameraScanner')
      expect(render).toContain('### modules/camera-scanner/ios/CameraScanner.swift')
      expect(render).toContain('## Install')
      expect(render).toContain('## Notes')
    })
  })

  describe('minimal spec', () => {
    it('generates a small module without a component or events', () => {
      const result = new NativeModuleGenerator().generate(
        { moduleName: 'Battery', methods: [{ name: 'getLevel', returnType: 'number' }] },
        { api: 'rn-cli' }
      )
      expect(result.files.some(f => f.path === 'src/specs/NativeBattery.ts')).toBe(true)
      expect(result.files.some(f => f.path.includes('BatteryModule.kt'))).toBe(true)
      const pkg = result.files.find(f => f.path.endsWith('BatteryPackage.kt'))!.content
      expect(pkg).toContain('emptyList()')
    })
  })
})
