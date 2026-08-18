"use strict";
/**
 * React Native Engineering Profile — proof-of-concept composition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Demonstrates how language + framework + platform profiles compose
 * into a complete React Native specialization.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactNativeEngineeringProfile = exports.rnTools = exports.rnGuardrails = exports.rnRules = void 0;
const EngineeringProfile_1 = require("../EngineeringProfile");
const LanguageProfileRegistry_1 = require("../LanguageProfileRegistry");
const FrameworkProfileRegistry_1 = require("../FrameworkProfileRegistry");
const PlatformProfileRegistry_1 = require("../PlatformProfileRegistry");
const typescript_1 = require("../languages/typescript");
const react_1 = require("../frameworks/react");
const react_native_1 = require("../frameworks/react-native");
const ios_1 = require("../platforms/ios");
const android_1 = require("../platforms/android");
// ─── Register plugins (each product calls this once at startup) ───────────
//
// Core never imports language or framework modules directly.
// Products register their dependencies into the global registries,
// then resolve them back. This keeps Core product-agnostic.
LanguageProfileRegistry_1.languageProfiles.register(typescript_1.typescriptDefinition, 'rn');
FrameworkProfileRegistry_1.frameworkProfiles.register(react_1.reactDefinition, 'rn');
FrameworkProfileRegistry_1.frameworkProfiles.register(react_native_1.reactNativeDefinition, 'rn');
PlatformProfileRegistry_1.platformProfiles.register(ios_1.iosDefinition, 'rn');
PlatformProfileRegistry_1.platformProfiles.register(android_1.androidDefinition, 'rn');
// Resolve from registries
const typescriptProfile = LanguageProfileRegistry_1.languageProfiles.require('typescript');
const reactNativeProfile = FrameworkProfileRegistry_1.frameworkProfiles.require('react-native');
// Resolve multi-platform rules — iOS + Android merged without duplication
const resolvedPlatforms = PlatformProfileRegistry_1.platformProfiles.resolveFor(['ios', 'android']);
const iosProfile = PlatformProfileRegistry_1.platformProfiles.require('ios');
const androidProfile = PlatformProfileRegistry_1.platformProfiles.require('android');
// ─── Rules — resolved from the framework registry ────────────────────────
//
// The framework registry walks the inheritance chain:
//   react-native → react → typescript
// and merges all rules without duplication.
// Language rules become categories; framework rules are executable.
const resolvedRules = FrameworkProfileRegistry_1.frameworkProfiles.resolveRules('react-native');
exports.rnRules = resolvedRules.allRules;
exports.rnGuardrails = {
    rules: exports.rnRules,
    onViolation: 'warn',
    config: {
        maxWarnings: 20,
        failOnError: true,
    },
};
// ─── Tools ─────────────────────────────────────────────────────────────────
exports.rnTools = [
    {
        id: 'rn-component-gen',
        name: 'Component Generator',
        description: 'Generate a new React Native component with tests and styles.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Component name (PascalCase)' },
                hasStyles: { type: 'boolean', description: 'Include StyleSheet', default: true },
                hasTests: { type: 'boolean', description: 'Include test file', default: true },
            },
            required: ['name'],
        },
    },
    {
        id: 'rn-lint-fix',
        name: 'Lint Fixer',
        description: 'Run ESLint with React Native config and auto-fix issues.',
        inputSchema: {
            type: 'object',
            properties: {
                files: { type: 'array', items: { type: 'string' }, description: 'Files to lint' },
                fix: { type: 'boolean', default: true },
            },
        },
    },
    {
        id: 'rn-native-module',
        name: 'Native Module Bridge',
        description: 'Create a bridge to a native iOS/Android module.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Module name' },
                platform: { type: 'string', enum: ['ios', 'android', 'both'] },
                methods: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'platform'],
        },
        dangerous: true,
    },
];
// ─── Composed React Native Profile ────────────────────────────────────────
/**
 * Pre-composed React Native engineering profile.
 *
 * Demonstrates the composition model:
 *   TypeScript + React + React Native + iOS/Android + rules + guardrails + tools
 */
exports.reactNativeEngineeringProfile = EngineeringProfile_1.EngineeringProfile.compose(
// Layer 1: Language foundation
{
    id: 'react-native',
    language: typescriptProfile,
    version: '1.0.0',
    metadata: {
        description: 'React Native engineering profile — TypeScript + React + RN + iOS/Android',
        tags: ['react-native', 'mobile', 'cross-platform'],
    },
}, 
// Layer 2: React Native framework (extends React via inherits field)
{
    framework: reactNativeProfile,
}, 
// Layer 4: iOS + Android platforms (multi-platform composition)
{
    platforms: [iosProfile, androidProfile],
}, 
// Layer 5: Rules, guardrails, and tools
{
    rules: exports.rnRules,
    guardrails: exports.rnGuardrails,
    tools: exports.rnTools,
});
