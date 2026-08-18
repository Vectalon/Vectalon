"use strict";
/**
 * React Native — framework profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Extends React with mobile-specific lifecycle, rules and pitfalls.
 * The `inherits: 'react'` field means the registry resolves the full
 * rule chain: [typescript rules] + [react rules] + [react-native rules].
 *
 * Register into a FrameworkProfileRegistry:
 *   registry.register(reactNativeDefinition, 'rn')
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactNativeDefinition = void 0;
exports.reactNativeDefinition = {
    id: 'react-native',
    name: 'React Native',
    version: '0.82',
    language: 'typescript',
    inherits: 'react',
    rules: [
        {
            id: 'RN-COMP-001',
            version: '1.0.0',
            name: 'No class components',
            description: 'React Native components must be functional components with hooks.',
            severity: 'error',
            category: 'architecture',
            appliesTo: ['*.tsx', '*.jsx'],
            check: () => [],
        },
        {
            id: 'RN-STYLE-001',
            version: '1.0.0',
            name: 'Use StyleSheet.create',
            description: 'Prefer StyleSheet.create() over inline style objects for performance and bridge optimization.',
            severity: 'warning',
            category: 'performance',
            appliesTo: ['*.tsx', '*.jsx'],
            detection: { type: 'regex', pattern: 'style=\{\{', matchMeaning: 'violate' },
            check: () => [],
        },
        {
            id: 'RN-FLAT-001',
            version: '1.0.0',
            name: 'Use FlatList for dynamic lists',
            description: 'Never map over arrays to render long lists. Use FlatList, SectionList, or FlashList.',
            severity: 'error',
            category: 'performance',
            appliesTo: ['*.tsx', '*.jsx'],
            detection: { type: 'ast', parser: 'typescript-estree', selector: 'JSXElement[openingElement.name.name=/^(ul|ol|div)$/]' },
            remediation: { type: 'guidance', steps: ['Replace .map() rendering with FlatList component'] },
            check: () => [],
        },
        {
            id: 'RN-BRIDGE-001',
            version: '1.0.0',
            name: 'Avoid synchronous bridge calls',
            description: 'NativeModules methods should be called asynchronously. Synchronous calls block the JS thread.',
            severity: 'error',
            category: 'performance',
            appliesTo: ['*.ts', '*.tsx'],
            check: () => [],
        },
        {
            id: 'RN-IMG-001',
            version: '1.0.0',
            name: 'Always specify Image dimensions',
            description: 'Always provide explicit width and height for Image components to prevent layout jumps.',
            severity: 'warning',
            category: 'correctness',
            appliesTo: ['*.tsx', '*.jsx'],
            check: () => [],
        },
        {
            id: 'RN-ANIM-001',
            version: '1.0.0',
            name: 'Use native driver for animations',
            description: 'Use useNativeDriver: true for Animated to run animations off the JS thread.',
            severity: 'warning',
            category: 'performance',
            appliesTo: ['*.ts', '*.tsx'],
            check: () => [],
        },
        {
            id: 'RN-NAV-001',
            version: '1.0.0',
            name: 'Type-safe navigation params',
            description: 'Define and use typed param lists for React Navigation. Never use string-based param access.',
            severity: 'warning',
            category: 'correctness',
            appliesTo: ['*.tsx', '*.ts'],
            check: () => [],
        },
        {
            id: 'RN-TEST-001',
            version: '1.0.0',
            name: 'Components require tests',
            description: 'All new components must have corresponding test files.',
            severity: 'warning',
            category: 'correctness',
            appliesTo: ['src/components/**/*.tsx'],
            detection: { type: 'test-coverage', framework: 'jest', sourcePattern: 'src/components/**/*.tsx', testPattern: '**/__tests__/**/*.test.tsx' },
            check: () => [],
        },
    ],
    lifecycle: [
        'mount',
        'update',
        'unmount',
        'app-state-change',
        'navigation-focus',
        'background',
        'foreground',
    ],
    patterns: [
        'hooks',
        'context',
        'composition',
        'new-architecture',
        'turbo-modules',
        'fabric',
    ],
    pitfalls: [
        {
            id: 'RN-PITFALL-001',
            name: 'Memory leaks from timers',
            description: 'Always clear setInterval/setTimeout in useEffect cleanup. Leaked timers keep native threads alive.',
            severity: 'error',
        },
        {
            id: 'RN-PITFALL-002',
            name: 'Large bundle from unused imports',
            description: 'Importing entire libraries (e.g., lodash) bloats the JS bundle. Use lodash-es or individual imports.',
            severity: 'warning',
        },
        {
            id: 'RN-PITFALL-003',
            name: 'Blocking the JS thread',
            description: 'Heavy computation in JS blocks animations and touch handling. Use InteractionManager or move to a native module.',
            severity: 'warning',
        },
    ],
    config: {
        hermesEnabled: true,
        newArchEnabled: false,
    },
};
