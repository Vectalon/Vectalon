/**
 * Ambient declarations for the golden scratch project.
 * The scratch CLI app has no react/react-native runtime installed, but the
 * feature workflow generates RN-style modules. These declarations let the
 * real TypeScript compile (GoldenTypeCheckTestRunner) resolve those imports
 * deterministically offline — module noise is neutralized, real type bugs
 * (e.g. a number assigned to a string) still surface.
 *
 * This copy ships in the committed cli-app demo, where it is inert: that
 * tsconfig only includes src/index.ts + src/__tests__/index.test.ts, so these
 * globals never collide with installed @types packages.
 */
declare module 'react' {
  declare function useState<T>(initial: T): [T, (value: T | ((prev: T) => T)) => void]
  declare function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T
  declare function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  declare function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  const React: any
  namespace React {
    namespace JSX {
      type Element = any
    }
  }
  export default React
  export { useState, useCallback, useEffect, useMemo }
}
declare module 'react-native' {
  const Text: any
  const Pressable: any
  const ActivityIndicator: any
  const StyleSheet: any
  const SafeAreaView: any
  const View: any
  const TextInput: any
  export { Text, Pressable, ActivityIndicator, StyleSheet, SafeAreaView, View, TextInput }
}
declare module '@testing-library/react-native' {
  const render: any
  const renderHook: any
  const act: any
  const fireEvent: any
  const waitFor: any
  export { render, renderHook, act, fireEvent, waitFor }
}
declare const describe: any
declare const it: any
declare const test: any
declare const expect: any
declare const beforeEach: any
declare const afterEach: any
declare const jest: any
declare const process: { argv: string[]; exit(code?: number): never }
declare const require: any
declare const module: any
