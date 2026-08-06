import { runGuardrails } from '../../src/guardrails'
import type { NewArchitectureInfo } from '../../src/utils/newArchitecture'

const ENABLED: NewArchitectureInfo = {
  enabled: true,
  sources: ['android/gradle.properties'],
  reason: 'new arch on',
  turboModuleSpecs: ['NativeCalendar', 'CalendarSpec'],
}

const DISABLED: NewArchitectureInfo = {
  enabled: false,
  sources: ['android/gradle.properties'],
  reason: 'legacy bridge',
  turboModuleSpecs: [],
}

function finding(result: { findings: Array<{ rule: string; passed: boolean; message?: string }> }, name: string) {
  return result.findings.find(f => f.rule === name)
}

describe('no-set-native-props', () => {
  const name = 'No setNativeProps in New Architecture projects'

  it('flags setNativeProps when New Architecture is enabled', () => {
    const result = runGuardrails({
      filePath: 'src/components/Header.tsx',
      content: 'export function Header() { ref.current.setNativeProps({ opacity: 0.5 }); return null; }',
      conventions: { newArchitecture: ENABLED },
    })
    const f = finding(result, name)
    expect(f).toBeDefined()
    expect(f?.passed).toBe(false)
  })

  it('passes when New Architecture is disabled', () => {
    const result = runGuardrails({
      filePath: 'src/components/Header.tsx',
      content: 'export function Header() { ref.current.setNativeProps({ opacity: 0.5 }); return null; }',
      conventions: { newArchitecture: DISABLED },
    })
    expect(finding(result, name)).toBeUndefined()
  })

  it('passes when no New Architecture info is known', () => {
    const result = runGuardrails({
      filePath: 'src/components/Header.tsx',
      content: 'ref.current.setNativeProps({ opacity: 0.5 })',
    })
    expect(finding(result, name)).toBeUndefined()
  })
})

describe('no-sync-native-module-calls', () => {
  const name = 'No synchronous NativeModules calls on New Architecture'

  it('flags a synchronous NativeModules call', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: 'export function getDate() { return NativeModules.Calendar.getDate(); }',
      conventions: { newArchitecture: ENABLED },
    })
    const f = finding(result, name)
    expect(f).toBeDefined()
    expect(f?.passed).toBe(false)
  })

  it('allows an awaited promise-based call', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: 'export async function getDate() { return await NativeModules.Calendar.getDate(); }',
      conventions: { newArchitecture: ENABLED },
    })
    expect(finding(result, name)?.passed).toBe(true)
  })

  it('allows a promise-chained .then() call', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: 'export function getDate() { return NativeModules.Calendar.getDate().then(d => d); }',
      conventions: { newArchitecture: ENABLED },
    })
    expect(finding(result, name)?.passed).toBe(true)
  })

  it('passes on the legacy bridge', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: 'export function getDate() { return NativeModules.Calendar.getDate(); }',
      conventions: { newArchitecture: DISABLED },
    })
    expect(finding(result, name)).toBeUndefined()
  })
})

describe('missing-turbomodule-spec', () => {
  const name = 'Native modules have a TurboModule TypeScript spec'

  it('flags a TurboModuleRegistry.get for a module with no spec', () => {
    const result = runGuardrails({
      filePath: 'src/native/useReminder.ts',
      content: 'const Reminder = TurboModuleRegistry.get(\'Reminder\');',
      conventions: { newArchitecture: ENABLED },
    })
    const f = finding(result, name)
    expect(f).toBeDefined()
    expect(f?.passed).toBe(false)
    expect(f?.message).toContain('Reminder')
  })

  it('passes when a matching spec exists', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: 'const Calendar = TurboModuleRegistry.get(\'Calendar\');',
      conventions: { newArchitecture: ENABLED },
    })
    expect(finding(result, name)?.passed).toBe(true)
  })

  it('flags direct NativeModules access with no spec', () => {
    const result = runGuardrails({
      filePath: 'src/native/useBluetooth.ts',
      content: 'NativeModules.Bluetooth.enable();',
      conventions: { newArchitecture: ENABLED },
    })
    const f = finding(result, name)
    expect(f).toBeDefined()
    expect(f?.passed).toBe(false)
    expect(f?.message).toContain('Bluetooth')
  })

  it('passes when New Architecture is disabled', () => {
    const result = runGuardrails({
      filePath: 'src/native/useReminder.ts',
      content: 'const Reminder = TurboModuleRegistry.get(\'Reminder\');',
      conventions: { newArchitecture: DISABLED },
    })
    expect(finding(result, name)).toBeUndefined()
  })
})

describe('integration with runGuardrails', () => {
  it('clean New Architecture file passes the applicable rules', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: [
        "import { NativeModules } from 'react-native'",
        'export async function getDate() {',
        '  return await NativeModules.Calendar.getDate();',
        '}',
      ].join('\n'),
      conventions: { newArchitecture: ENABLED },
    })
    // Sync-call rule applies (NativeModules call) and passes because it is awaited.
    expect(finding(result, 'No synchronous NativeModules calls on New Architecture')?.passed).toBe(true)
    // Spec rule applies (NativeModules.Calendar) and passes — NativeCalendar spec exists.
    expect(finding(result, 'Native modules have a TurboModule TypeScript spec')?.passed).toBe(true)
    // setNativeProps is not present, so its rule is skipped entirely.
    expect(finding(result, 'No setNativeProps in New Architecture projects')).toBeUndefined()
  })

  it('a legacy-bridge file is not penalized for New Architecture rules', () => {
    const result = runGuardrails({
      filePath: 'src/native/useCalendar.ts',
      content: 'export function getDate() { return NativeModules.Calendar.getDate(); }',
      conventions: { newArchitecture: DISABLED },
    })
    // None of the New-Architecture-only rules fire on the legacy bridge.
    expect(finding(result, 'No setNativeProps in New Architecture projects')).toBeUndefined()
    expect(finding(result, 'No synchronous NativeModules calls on New Architecture')).toBeUndefined()
    expect(finding(result, 'Native modules have a TurboModule TypeScript spec')).toBeUndefined()
  })
})
