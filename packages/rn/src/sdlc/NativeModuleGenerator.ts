/**
 * TurboModule & Fabric Component Scaffolding.
 *
 * Deterministic code generation for the full React Native New Architecture
 * native stack from a single structured spec:
 *
 *   TypeScript spec → iOS Objective-C++ JSI bindings → Android Kotlin
 *   implementation → podspec / build.gradle entries → codegen config.
 *
 * Two APIs are supported:
 *
 * - **Bare RN CLI** (`api: 'rn-cli'`) — a `Native<Module>.ts` TurboModule spec
 *   under `src/specs/`, `NativeModules` iOS `.h`/`.mm` (RCTEventEmitter +
 *   promise handlers), Android Kotlin `Module` + `Package`, a `<Module>.podspec`,
 *   an `android/build.gradle` library config, and a `react-native.config.js`
 *   `codegenConfig` block. Fabric components generate
 *   `<Component>NativeComponent.ts`, an iOS `<Component>Manager.mm` and an
 *   Android `SimpleViewManager` + view stub.
 *
 * - **Expo Modules API** (`api: 'expo'`) — the `modules/<name>/` layout:
 *   `src/index.ts` (`requireNativeModule`), Kotlin + Swift `Module`
 *   definitions with `AsyncFunction`/`Function`/`Events`, and
 *   `expo-module.config.json` for autolinking. Fabric components use the
 *   `View`/`Prop` DSL.
 *
 * Every file is a deterministic scaffold: it compiles against the target
 * platform's conventions and carries `TODO` markers where real business logic
 * goes, plus `install` steps (pod install / gradle / codegen) and honest notes
 * about New Architecture semantics (sync methods are bridged as async at
 * runtime on bridgeless; the codegen pass produces the interop layer).
 */

export type NativeMethodKind = 'sync' | 'promise'

export interface NativeMethodParam {
  name: string
  type: string
}

export interface NativeMethod {
  name: string
  params?: NativeMethodParam[]
  /** Return type: string | number | boolean | object | array<string> |
   * promise<T> | void. Sync returns are declared in the TS spec; at runtime
   * the bridgeless bridge delivers them asynchronously. */
  returnType?: string
}

export interface NativeComponentProp {
  name: string
  type: string
}

export interface NativeComponentSpec {
  name: string
  props?: NativeComponentProp[]
  events?: string[]
}

export interface NativeModuleSpec {
  moduleName: string
  /** Android java package (RN CLI) / expo module package (Expo). */
  packageName?: string
  /** Module-level constants: name → value. */
  constants?: Record<string, string | number | boolean>
  /** Emitted event names (NativeEventEmitter). */
  events?: string[]
  methods?: NativeMethod[]
  /** Optional Fabric component shipped alongside the module. */
  component?: NativeComponentSpec
}

export interface GeneratedNativeFile {
  path: string
  content: string
}

export interface GeneratedNativeModule {
  spec: NativeModuleSpec
  api: 'rn-cli' | 'expo'
  files: GeneratedNativeFile[]
  install: string[]
  notes: string[]
}

/** Parse a native module spec from a JSON string or a plain object. */
export function parseNativeModuleSpec(input: string | Record<string, unknown> | object): NativeModuleSpec {
  let raw: Record<string, unknown>
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input) as Record<string, unknown>
    } catch (err) {
      throw new Error(
        `Invalid native module spec JSON: ${err instanceof Error ? err.message : String(err)}. ` +
          'Expected { moduleName, methods, constants?, events?, component? }'
      )
    }
  } else {
    raw = input as Record<string, unknown>
  }

  const moduleName = String(raw.moduleName || '').trim()
  if (!moduleName) throw new Error('A non-empty `moduleName` is required (e.g. "CameraScanner").')

  const spec: NativeModuleSpec = {
    moduleName,
    packageName: raw.packageName ? String(raw.packageName) : defaultPackageName(moduleName),
    constants: (raw.constants as Record<string, string | number | boolean> | undefined) || {},
    events: (raw.events as string[] | undefined) || [],
    // Harden the object path: a non-array `methods` (e.g. a string) must not
    // crash generation later at `.map`.
    methods: Array.isArray(raw.methods) ? (raw.methods as NativeMethod[]) : [],
  }

  if (raw.component && typeof raw.component === 'object') {
    const c = raw.component as Record<string, unknown>
    const name = String(c.name || '').trim()
    if (name) {
      spec.component = {
        name,
        props: (c.props as NativeComponentProp[] | undefined) || [],
        events: (c.events as string[] | undefined) || [],
      }
    }
  }

  return spec
}

/** LowerCamelCase the module name into a sane default java package. */
export function defaultPackageName(moduleName: string): string {
  const cleaned = moduleName.replace(/[^A-Za-z0-9]/g, '')
  const lower = cleaned.charAt(0).toLowerCase() + cleaned.slice(1)
  return `com.${lower.toLowerCase()}`
}

/** Expo module package: expo.modules.<lowercase module name>. */
function expoPackageName(spec: NativeModuleSpec): string {
  const name = spec.moduleName.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  return `expo.modules.${name}`
}

// ---------------------------------------------------------------- type maps

function tsType(type: string): string {
  const t = type.trim()
  if (t.startsWith('promise<')) return `Promise<${tsType(t.slice(8, -1))}>`
  switch (t) {
    case 'string': return 'string'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'object': return 'Record<string, unknown>'
    case 'array<string>': return 'string[]'
    case 'void': return 'void'
    default: return t
  }
}

function kotlinType(type: string): string {
  const t = type.trim()
  if (t.startsWith('promise<')) return kotlinType(t.slice(8, -1))
  switch (t) {
    case 'string': return 'String'
    case 'number': return 'Double'
    case 'boolean': return 'Boolean'
    case 'object': return 'ReadableMap'
    case 'array<string>': return 'ReadableArray'
    case 'void': return 'Unit'
    default: return 'Any'
  }
}

/** Whether a method's return type is promise-typed (async). */
function isPromiseMethod(method: NativeMethod): boolean {
  return (method.returnType || 'void').trim().startsWith('promise<')
}

// -------------------------------------------------------------------- RN CLI

function rnCliFiles(spec: NativeModuleSpec): GeneratedNativeFile[] {
  const { moduleName: name } = spec
  const files: GeneratedNativeFile[] = []

  files.push({ path: `src/specs/Native${name}.ts`, content: turboModuleSpecTs(spec) })
  files.push({ path: `ios/${name}.h`, content: iosHeader(spec) })
  files.push({ path: `ios/${name}.mm`, content: iosImpl(spec) })

  const androidRoot = `android/src/main/java/${spec.packageName!.split('.').join('/')}`
  files.push({ path: `${androidRoot}/${name}Module.kt`, content: androidModule(spec) })
  files.push({ path: `${androidRoot}/${name}Package.kt`, content: androidPackage(spec) })

  if (spec.component) {
    files.push({ path: `src/specs/${spec.component.name}NativeComponent.ts`, content: fabricComponentSpec(spec) })
    files.push({ path: `ios/${spec.component.name}Manager.mm`, content: iosViewManager(spec) })
    files.push({ path: `${androidRoot}/${spec.component.name}.kt`, content: androidViewStub(spec) })
    files.push({ path: `${androidRoot}/${spec.component.name}Manager.kt`, content: androidViewManager(spec) })
  }

  files.push({ path: `${name}.podspec`, content: podspec(spec) })
  files.push({ path: 'android/build.gradle', content: androidBuildGradle(spec) })
  files.push({ path: 'react-native.config.js', content: rnCliCodegenConfig(spec) })

  return files
}

function turboModuleSpecTs(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  const lines: string[] = [
    "import type { TurboModule } from 'react-native'",
    "import { TurboModuleRegistry } from 'react-native'",
    '',
    `export interface Spec extends TurboModule {`,
  ]

  for (const [key, value] of Object.entries(spec.constants || {})) {
    const valueType = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'
    lines.push(`  readonly ${key}: ${valueType}`)
  }

  for (const method of spec.methods || []) {
    const params = (method.params || []).map(p => `${p.name}: ${tsType(p.type)}`).join(', ')
    lines.push(`  ${method.name}(${params}): ${tsType(method.returnType || 'void')}`)
  }

  if ((spec.events || []).length > 0) {
    lines.push(`  addListener(eventName: string): void`)
    lines.push(`  removeListeners(count: number): void`)
  }

  lines.push('}')
  lines.push('')
  lines.push(`export default TurboModuleRegistry.getEnforcing<Spec>('${name}')`)
  return lines.join('\n')
}

function iosHeader(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  return [
    `#import <React/RCTBridgeModule.h>`,
    `#import <React/RCTEventEmitter.h>`,
    '',
    `NS_ASSUME_NONNULL_BEGIN`,
    '',
    `@interface ${name} : RCTEventEmitter <RCTBridgeModule>`,
    `@end`,
    '',
    `NS_ASSUME_NONNULL_END`,
    '',
  ].join('\n')
}

function iosImpl(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  const events = spec.events || []
  const eventLiteral = events.map(e => `@"${e}"`).join(', ')
  const lines: string[] = [
    `#import "${name}.h"`,
    '',
    `@implementation ${name}`,
    '',
    `RCT_EXPORT_MODULE(${name})`,
    '',
    `+ (BOOL)requiresMainQueueSetup {`,
    `  return NO;`,
    `}`,
    '',
  ]

  if (events.length > 0) {
    lines.push(
      `- (NSArray<NSString *> *)supportedEvents {`,
      `  return @[${eventLiteral}];`,
      `}`,
      ''
    )
  }

  for (const method of spec.methods || []) {
    lines.push(...iosMethod(method))
    lines.push('')
  }

  lines.push('@end', '')
  return lines.join('\n')
}

/** One RCT_EXPORT_METHOD handler. Promise-typed returns get resolve/reject. */
function iosMethod(method: NativeMethod): string[] {
  const params = (method.params || [])
  const promise = isPromiseMethod(method)
  const body = promise
    ? `  resolve(@"TODO: implement ${method.name}");`
    : `  // TODO: implement ${method.name}. Sync returns are delivered asynchronously on the New Architecture.`

  const lines: string[] = [`RCT_EXPORT_METHOD(${method.name}`]
  for (const param of params) {
    lines.push(`                  ${param.name}:(${objcType(param.type)})${param.name}`)
  }
  if (promise) {
    lines.push(`                  resolve:(RCTPromiseResolveBlock)resolve`)
    lines.push(`                  reject:(RCTPromiseRejectBlock)reject)`)
  } else {
    lines.push(`)`)
  }
  lines.push(`{`, body, `}`, '')
  return lines
}

function objcType(type: string): string {
  const t = type.trim()
  switch (t) {
    case 'string': return 'NSString *'
    case 'number': return 'double'
    case 'boolean': return 'BOOL'
    case 'object': return 'NSDictionary *'
    case 'array<string>': return 'NSArray<NSString *> *'
    default: return 'id'
  }
}

function androidModule(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  const pkg = spec.packageName!
  const lines: string[] = [
    `package ${pkg}`,
    '',
    `import com.facebook.react.bridge.*`,
    `import com.facebook.react.module.annotations.ReactModule`,
    `import com.facebook.react.modules.core.DeviceEventManagerModule`,
    '',
    `@ReactModule(name = ${name}Module.NAME)`,
    `class ${name}Module(reactContext: ReactApplicationContext) :`,
    `  ReactContextBaseJavaModule(reactContext) {`,
    '',
    `  companion object {`,
    `    const val NAME = "${name}"`,
  ]
  for (const [key, value] of Object.entries(spec.constants || {})) {
    lines.push(`    const val ${key} = "${String(value)}"`)
  }
  lines.push(`  }`, '', `  override fun getName() = NAME`, '')

  if (Object.keys(spec.constants || {}).length > 0) {
    lines.push(
      `  override fun getConstants(): MutableMap<String, Any> {`,
      `    return mutableMapOf(${Object.keys(spec.constants || {}).map(k => `"${k}" to ${k}`).join(', ')})`,
      `  }`,
      ''
    )
  }

  for (const method of spec.methods || []) {
    lines.push(...androidMethod(method))
    lines.push('')
  }

  if ((spec.events || []).length > 0) {
    lines.push(
      `  private fun sendEvent(eventName: String, params: WritableMap?) {`,
      `    reactApplicationContext`,
      `      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)`,
      `      .emit(eventName, params)`,
      `  }`,
      ''
    )
  }

  lines.push(`}`, '')
  return lines.join('\n')
}

function androidMethod(method: NativeMethod): string[] {
  const params = method.params || []
  const promise = isPromiseMethod(method)
  const lines: string[] = [`  @ReactMethod`]
  // Declared params first (Kotlin types), then the Promise when async.
  const args: string[] = params.map(p => `${p.name}: ${kotlinType(p.type)}`)
  if (promise) args.push('promise: Promise')
  const body = promise
    ? `    promise.resolve("TODO: implement ${method.name}")`
    : `    // TODO: implement ${method.name}`
  lines.push(`  fun ${method.name}(${args.join(', ')}) {`)
  lines.push(body)
  lines.push(`  }`)
  return lines
}

function androidPackage(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  const pkg = spec.packageName!
  const lines: string[] = [
    `package ${pkg}`,
    '',
    `import com.facebook.react.ReactPackage`,
    `import com.facebook.react.bridge.NativeModule`,
    `import com.facebook.react.bridge.ReactApplicationContext`,
    `import com.facebook.react.uimanager.ViewManager`,
    '',
    `class ${name}Package : ReactPackage {`,
    `  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =`,
    `    listOf(${name}Module(reactContext))`,
    '',
    `  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =`,
  ]
  lines.push(
    spec.component
      ? `    listOf(${spec.component.name}Manager())`
      : `    emptyList()`
  )
  lines.push(`}`, '')
  return lines.join('\n')
}

function fabricComponentSpec(spec: NativeModuleSpec): string {
  const c = spec.component!
  const lines: string[] = [
    "import type { HostComponent, ViewProps } from 'react-native'",
    "import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent'",
    '',
    `export interface NativeProps extends ViewProps {`,
  ]
  for (const prop of c.props || []) {
    lines.push(`  ${prop.name}?: ${tsType(prop.type)}`)
  }
  lines.push(`}`, '')
  lines.push(`export default codegenNativeComponent<NativeProps>('${c.name}') as HostComponent<NativeProps>`)
  return lines.join('\n')
}

function iosViewManager(spec: NativeModuleSpec): string {
  const c = spec.component!
  const lines: string[] = [
    `#import <React/RCTViewManager.h>`,
    '',
    `@interface ${c.name}Manager : RCTViewManager`,
    `@end`,
    '',
    `@implementation ${c.name}Manager`,
    '',
    `RCT_EXPORT_MODULE(${c.name})`,
    '',
  ]
  for (const prop of c.props || []) {
    lines.push(`RCT_EXPORT_VIEW_PROPERTY(${prop.name}, ${objcType(prop.type)})`, '')
  }
  lines.push(`@end`, '')
  return lines.join('\n')
}

function androidViewStub(spec: NativeModuleSpec): string {
  const c = spec.component!
  const pkg = spec.packageName!
  return [
    `package ${pkg}`,
    '',
    `import android.content.Context`,
    `import android.widget.FrameLayout`,
    '',
    `/** Native ${c.name} view. Add your custom rendering here (SurfaceView, TextureView, etc.). */`,
    `class ${c.name}(context: Context) : FrameLayout(context) {`,
    `  // TODO: implement native view rendering for ${c.name}`,
    `}`,
    '',
  ].join('\n')
}

function androidViewManager(spec: NativeModuleSpec): string {
  const c = spec.component!
  const pkg = spec.packageName!
  const lines: string[] = [
    `package ${pkg}`,
    '',
    `import com.facebook.react.uimanager.SimpleViewManager`,
    `import com.facebook.react.uimanager.ThemedReactContext`,
    `import com.facebook.react.uimanager.annotations.ReactProp`,
    '',
    `class ${c.name}Manager : SimpleViewManager<${c.name}>() {`,
    `  override fun getName() = "${c.name}"`,
    '',
    `  override fun createViewInstance(reactContext: ThemedReactContext) = ${c.name}(reactContext)`,
    '',
  ]
  for (const prop of c.props || []) {
    const type = prop.type === 'boolean' ? 'Boolean' : prop.type === 'number' ? 'Double' : 'String?'
    lines.push(
      `  @ReactProp(name = "${prop.name}")`,
      `  fun set${prop.name[0].toUpperCase() + prop.name.slice(1)}(view: ${c.name}, value: ${type}) {`,
      `    // TODO: apply ${prop.name}`,
      `  }`,
      ''
    )
  }
  lines.push(`}`, '')
  return lines.join('\n')
}

function podspec(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  return [
    `require "json"`,
    '',
    `package = JSON.parse(File.read(File.join(__dir__, "package.json")))`,
    '',
    `Pod::Spec.new do |s|`,
    `  s.name            = "${name}"`,
    `  s.version         = package["version"]`,
    `  s.summary         = "${name} native module"`,
    `  s.description     = package["description"]`,
    `  s.homepage        = package["homepage"]`,
    `  s.license         = package["license"]`,
    `  s.author          = package["author"]`,
    `  s.source          = { :git => package["repository"]["url"] }`,
    `  s.source_files    = "ios/**/*.{h,m,mm}"`,
    `  s.dependency "React-Core"`,
    `  s.dependency "React-RCTEventEmitter"`,
    `end`,
    '',
  ].join('\n')
}

function androidBuildGradle(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  return [
    `// Android library config for the ${name} native module.`,
    `// This is the in-repo equivalent of a published package's build.gradle.`,
    `apply plugin: "com.android.library"`,
    `apply plugin: "org.jetbrains.kotlin.android"`,
    `apply plugin: "com.facebook.react"`,
    '',
    `repositories {`,
    `  mavenCentral()`,
    `}`,
    '',
    `dependencies {`,
    `  implementation "com.facebook.react:react-android"`,
    `  implementation "org.jetbrains.kotlin:kotlin-stdlib"`,
    `}`,
    '',
  ].join('\n')
}function rnCliCodegenConfig(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  // A package with both a TurboModule and a Fabric component needs `type:
  // 'all'` — a single 'modules' or 'components' would make codegen miss half
  // the spec files.
  const hasComponent = !!spec.component
  const hasModule = (spec.methods || []).length > 0
  const codegenType = hasComponent && hasModule ? 'all' : hasComponent ? 'components' : 'modules'
  return [
    `// Codegen config for the ${name} TurboModule${spec.component ? ' + Fabric component' : ''}.`,
    `// Merge into the app's react-native.config.js (or create it).`,
    `module.exports = {`,
    `  codegenConfig: {`,
    `    name: '${name}Spec',`,
    `    type: '${codegenType}',`,
    `    jsSrcsDir: 'src/specs',`,
    `    android: {`,
    `      javaPackageName: '${spec.packageName}',`,
    `    },`,
    `  },
    `,
    `}`,
    '',
  ].join('\n')
}

// -------------------------------------------------------------------- Expo

function expoFiles(spec: NativeModuleSpec): GeneratedNativeFile[] {
  const { moduleName: name } = spec
  const id = kebabCase(name)
  const pkg = expoPackageName(spec)
  const root = `modules/${id}`
  const files: GeneratedNativeFile[] = []

  files.push({ path: `${root}/package.json`, content: expoPackageJson(spec, id) })
  files.push({ path: `${root}/src/index.ts`, content: expoIndexTs(spec) })
  files.push({
    path: `${root}/android/src/main/java/${pkg.replace(/\./g, '/')}/${name}Module.kt`,
    content: expoKotlinModule(spec, pkg),
  })
  files.push({ path: `${root}/ios/${name}.swift`, content: expoSwiftModule(spec) })

  if (spec.component) {
    files.push({
      path: `${root}/src/${spec.component.name}NativeComponent.ts`,
      content: expoComponentTs(spec),
    })
    files.push({
      path: `${root}/android/src/main/java/${pkg.replace(/\./g, '/')}/${spec.component.name}.kt`,
      content: expoAndroidView(spec, pkg),
    })
    files.push({ path: `${root}/ios/${spec.component.name}.swift`, content: expoIosView(spec) })
  }

  files.push({ path: `${root}/expo-module.config.json`, content: expoModuleConfig(spec, pkg) })
  return files
}

function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toLowerCase()
}

function expoPackageJson(spec: NativeModuleSpec, id: string): string {
  const { moduleName: name } = spec
  return JSON.stringify(
    {
      name: id,
      version: '1.0.0',
      main: 'src/index.ts',
      description: `${name} Expo module`,
      license: 'MIT',
    },
    null,
    2
  ) + '\n'
}

function expoIndexTs(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  const lines: string[] = [
    `import { requireNativeModule } from 'expo-modules-core'`,
    '',
    `// Type the native module surface here — mirror the Kotlin/Swift definition.`,
    `export interface ${name}Module {`,
  ]
  for (const [key, value] of Object.entries(spec.constants || {})) {
    const valueType = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'
    lines.push(`  ${key}: ${valueType}`)
  }
  for (const method of spec.methods || []) {
    const params = (method.params || []).map(p => `${p.name}: ${tsType(p.type)}`).join(', ')
    lines.push(`  ${method.name}(${params}): ${tsType(method.returnType || 'void')}`)
  }
  lines.push(
    `}`,
    '',
    `export default requireNativeModule<${name}Module>('${name}')`,
    ''
  )
  return lines.join('\n')
}

function expoKotlinModule(spec: NativeModuleSpec, pkg: string): string {
  const { moduleName: name } = spec
  const lines: string[] = [
    `package ${pkg}`,
    '',
    `import expo.modules.kotlin.modules.Module`,
    `import expo.modules.kotlin.modules.ModuleDefinition`,
    '',
    `class ${name}Module : Module() {`,
    `  override fun definition() = ModuleDefinition {`,
    `    Name("${name}")`,
    '',
  ]

  if (Object.keys(spec.constants || {}).length > 0) {
    lines.push(`    Constants(`)
    for (const [key, value] of Object.entries(spec.constants || {})) {
      const literal = typeof value === 'number' || typeof value === 'boolean' ? String(value) : `"${value}"`
      lines.push(`      "${key}" to ${literal},`)
    }
    lines.push(`    )`, '')
  }

  for (const method of spec.methods || []) {
    if (isPromiseMethod(method)) {
      lines.push(`    AsyncFunction("${method.name}") {`)
      lines.push(`      // TODO: implement ${method.name}`)
      lines.push(`      "TODO result"`)
      lines.push(`    }`, '')
    } else {
      lines.push(`    Function("${method.name}") { ${expoKotlinParams(method)} ->`)
      lines.push(`      // TODO: implement ${method.name}`)
      lines.push(`    }`, '')
    }
  }

  if ((spec.events || []).length > 0) {
    lines.push(`    Events(${(spec.events || []).map(e => `"${e}"`).join(', ')})`, '')
  }

  if (spec.component) {
    const c = spec.component
    lines.push(
      `    View(${c.name}::class) {`,
      `      Name("${c.name}")`,
      ''
    )
    for (const prop of c.props || []) {
      lines.push(
        `      Prop("${prop.name}") { view: ${c.name}, value: ${prop.type === 'boolean' ? 'Boolean' : prop.type === 'number' ? 'Double' : 'String?'} ->`,
        `        // TODO: apply ${prop.name}`,
        `      }`,
        ''
      )
    }
    lines.push(`    }`, '')
  }

  lines.push(`  }`, `}`, '')
  return lines.join('\n')
}

function expoKotlinParams(method: NativeMethod): string {
  const params = (method.params || []).map(p => `${p.name}: ${kotlinType(p.type)}`)
  return params.length > 0 ? params.join(', ') : ''
}

function expoSwiftModule(spec: NativeModuleSpec): string {
  const { moduleName: name } = spec
  const lines: string[] = [
    `import ExpoModulesCore`,
    '',
    `public class ${name}Module: Module {`,
    `  public func definition() -> ModuleDefinition {`,
    `    Name("${name}")`,
    '',
  ]

  if (Object.keys(spec.constants || {}).length > 0) {
    lines.push(`    Constants([`)
    for (const [key, value] of Object.entries(spec.constants || {})) {
      const literal = typeof value === 'number' || typeof value === 'boolean' ? String(value) : `"${value}"`
      lines.push(`      "${key}": ${literal},`)
    }
    lines.push(`    ])`, '')
  }

  for (const method of spec.methods || []) {
    if (isPromiseMethod(method)) {
      lines.push(`    AsyncFunction("${method.name}") { () -> String in`)
      lines.push(`      // TODO: implement ${method.name}`)
      lines.push(`      "TODO result"`)
      lines.push(`    }`, '')
    } else {
      const swiftParams = (method.params || []).map(p => `${p.name}: ${swiftType(p.type)}`).join(', ')
      lines.push(`    Function("${method.name}") { (${swiftParams}) in`)
      lines.push(`      // TODO: implement ${method.name}`)
      lines.push(`    }`, '')
    }
  }

  if ((spec.events || []).length > 0) {
    lines.push(`    Events(${(spec.events || []).map(e => `"${e}"`).join(', ')})`, '')
  }

  if (spec.component) {
    const c = spec.component
    lines.push(
      `    View(${c.name}.self) {`,
      `      Name("${c.name}")`,
      ''
    )
    for (const prop of c.props || []) {
      lines.push(
        `      Prop("${prop.name}") { (view: ${c.name}, value: ${swiftType(prop.type)}) in`,
        `        // TODO: apply ${prop.name}`,
        `      }`,
        ''
      )
    }
    lines.push(`    }`, '')
  }

  lines.push(`  }`, `}`, '')
  return lines.join('\n')
}

function swiftType(type: string): string {
  const t = type.trim()
  switch (t) {
    case 'string': return 'String'
    case 'number': return 'Double'
    case 'boolean': return 'Bool'
    case 'object': return '[String: Any]'
    case 'array<string>': return '[String]'
    default: return 'Any'
  }
}

function expoComponentTs(spec: NativeModuleSpec): string {
  const c = spec.component!
  const lines: string[] = [
    `import { requireNativeView } from 'expo'`,
    `import * as React from 'react'`,
    '',
    `export type ${c.name}Props = {`,
  ]
  for (const prop of c.props || []) {
    lines.push(`  ${prop.name}?: ${tsType(prop.type)}`)
  }
  lines.push(`}`)
  lines.push('')
  lines.push(`export const ${c.name} = requireNativeView<${c.name}Props>('${c.name}')`)
  lines.push('')
  return lines.join('\n')
}

function expoAndroidView(spec: NativeModuleSpec, pkg: string): string {
  const c = spec.component!
  return [
    `package ${pkg}`,
    '',
    `import android.content.Context`,
    `import android.widget.FrameLayout`,
    '',
    `/** Native ${c.name} view. Add your custom rendering here. */`,
    `open class ${c.name}(context: Context) : FrameLayout(context) {`,
    `  // TODO: implement native view rendering for ${c.name}`,
    `}`,
    '',
  ].join('\n')
}

function expoIosView(spec: NativeModuleSpec): string {
  const c = spec.component!
  return [
    `import ExpoModulesCore`,
    '',
    `public class ${c.name}: ExpoView {`,
    `  // TODO: implement native view rendering for ${c.name}`,
    `}`,
    '',
  ].join('\n')
}

function expoModuleConfig(spec: NativeModuleSpec, pkg: string): string {
  const { moduleName: name } = spec
  const config: Record<string, unknown> = {
    platforms: ['apple', 'android'],
    apple: { modules: [`${name}Module`] },
    android: { modules: [`${pkg}.${name}Module`] },
  }
  return JSON.stringify(config, null, 2) + '\n'
}

// ----------------------------------------------------------------- generator

export class NativeModuleGenerator {
  /** Generate the full native module scaffold for the chosen API. */
  generate(input: string | NativeModuleSpec, options: { api?: 'rn-cli' | 'expo' } = {}): GeneratedNativeModule {
    // Normalize both inputs through the parser so packageName/methods/etc.
    // defaults always apply (plain objects are normalized the same as JSON).
    const spec = parseNativeModuleSpec(input)
    const api = options.api === 'expo' ? 'expo' : 'rn-cli'
    const files = api === 'expo' ? expoFiles(spec) : rnCliFiles(spec)
    return {
      spec,
      api,
      files,
      install: this.installSteps(spec, api),
      notes: this.notes(spec, api),
    }
  }

  private installSteps(spec: NativeModuleSpec, api: 'rn-cli' | 'expo'): string[] {
    const { moduleName: name } = spec
    if (api === 'expo') {
      return [
        `Add the module to the app's package.json (or Expo autolinks local modules under modules/ on next start):`,
        `  "dependencies": { "${kebabCase(name)}": "file:./modules/${kebabCase(name)}" }`,
        'Reinstall pod/Android deps so autolinking picks it up:',
        '  npx expo prebuild --clean   (or: npx pod-install / cd ios && pod install)',
        'Rebuild the dev client / run the app to compile the new native code.',
      ]
    }
    return [
      `Run codegen + pod install so the TurboModule interop layer is generated:`,
      `  cd ios && bundle exec pod install`,
      `For Android, make sure the module's android/ is included by the app settings.gradle (or publish it as a package and add it to package.json), then:`,
      `  cd android && ./gradlew :app:generateCodegenArtifactsFromSchema`,
      `Merge the generated react-native.config.js codegenConfig block into the app's existing react-native.config.js (if one exists).`,
      `Restart Metro with --reset-cache so the codegen'd spec is picked up.`,
    ]
  }

  private notes(spec: NativeModuleSpec, api: 'rn-cli' | 'expo'): string[] {
    const notes: string[] = [
      `Every generated file is a scaffold: the TODO markers are where real business logic goes. The native side compiles as-is and returns placeholder values.`,
    ]
    if (api === 'rn-cli') {
      notes.push(
        `New Architecture semantics: promise-typed methods resolve a placeholder value; methods declared with sync return types in the TS spec are delivered to JS as promises on bridgeless — the placeholder handlers do not resolve them yet, so a sync call resolves undefined until you implement it.`,
        `The generated ios/, android/, and react-native.config.js paths assume a standalone package layout. Do NOT copy android/build.gradle over an existing app android/ dir — drop the files into a package folder (or the node_modules/<pkg> checkout), wire the podspec into the app Podfile (pod '${spec.moduleName}', :path => ...), and include the module's android/ via settings.gradle.`
      )
    } else {
      notes.push(
        `Expo Modules API: AsyncFunction bodies are coroutines on Android and async on iOS — keep them suspendable/async. Function is synchronous and runs on a background thread; do not block the JS thread with heavy work.`
      )
    }
    if (spec.component) {
      notes.push(
        `The Fabric component (${spec.component.name}) needs the codegen pass to produce the view interop layer; the manager/view stubs are the hand-written half.`
      )
    }
    return notes
  }

  /** Render the scaffold as a markdown manifest (the MCP tool's return value). */
  render(result: GeneratedNativeModule): string {
    const fence = '```'
    const parts = [
      `# Native module scaffold: ${result.spec.moduleName}`,
      '',
      `**API:** ${result.api === 'expo' ? 'Expo Modules API' : 'Bare RN CLI (New Architecture)'}`,
      `**Files:** ${result.files.length}`,
      '',
      `## Files`,
      '',
    ]
    for (const file of result.files) {
      parts.push(`### ${file.path}`, '', fence, file.content.trimEnd(), fence, '')
    }
    parts.push('## Install', '')
    for (const step of result.install) {
      parts.push(`- ${step}`)
    }
    parts.push('', '## Notes', '')
    for (const note of result.notes) {
      parts.push(`- ${note}`)
    }
    parts.push('')
    return parts.join('\n')
  }
}
