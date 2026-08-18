"use strict";
/**
 * TypeScript — language profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * This is a first-class language plugin. It can be registered into
 * any LanguageProfileRegistry:
 *
 *   registry.register(typescriptDefinition, 'rn')
 *
 * Additional languages (Swift, Kotlin, Python, Rust) follow the
 * same pattern — each is a standalone module exporting a LanguageProfile.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.typescriptDefinition = void 0;
/**
 * TypeScript language profile.
 *
 * Covers the full surface area: features, rules (machine-readable),
 * anti-patterns, idioms, file extensions, and parser hint.
 */
exports.typescriptDefinition = {
    id: 'typescript',
    name: 'TypeScript',
    version: '5.x',
    parser: 'typescript-estree',
    fileExtensions: ['.ts', '.tsx', '.mts', '.cts'],
    rules: [
        'strict-types',
        'avoid-any',
        'prefer-unknown',
        'explicit-error-handling',
        'no-implicit-any',
        'prefer-readonly',
        'discriminated-unions',
        'no-unused-locals',
        'no-unused-params',
        'consistent-naming',
    ],
    features: {
        typing: 'gradual',
        concurrency: 'event-loop',
        errorHandling: 'exceptions',
        moduleSystem: 'esm',
        nullSafety: 'optional',
        generics: true,
        patternMatching: false,
    },
    antiPatterns: [
        {
            id: 'TS-ANY-001',
            name: 'Avoid `any` type',
            description: 'Use `unknown` or specific types instead of `any` to preserve type safety.',
            severity: 'warning',
        },
        {
            id: 'TS-IMPLICIT-001',
            name: 'Avoid implicit any in parameters',
            description: 'Explicitly type all function parameters.',
            severity: 'error',
        },
        {
            id: 'TS-ASSERT-001',
            name: 'Avoid non-null assertions',
            description: 'Prefer optional chaining or explicit null checks over the `!` operator.',
            severity: 'warning',
        },
        {
            id: 'TS-ENUM-001',
            name: 'Prefer union types over enums',
            description: 'Use string union types instead of TypeScript enums for better tree-shaking and interop.',
            severity: 'info',
        },
    ],
    idioms: [
        'Use interfaces over type aliases for object shapes',
        'Prefer readonly arrays and objects for immutable data',
        'Use discriminated unions for state machines',
        'Prefer `const` assertions for literal types',
        'Use template literal types for string patterns',
        'Prefer `as const` for fixed-value collections',
    ],
    config: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: false,
    },
};
