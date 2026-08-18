/**
 * React Native — real engineering rules with working detection
 * Business Source License 1.1 (BSL-1.1)
 *
 * 10 rules that detect actual violations in RN codebases.
 * Each rule has a working check() function using regex scanning.
 * Tests cover both valid (no finding) and invalid (finding) cases.
 */
import type { EngineeringRule } from '../EngineeringRule';
/**
 * Network requests must go through a centralized APIClient.
 * Raw fetch() calls are not allowed — they bypass auth, logging,
 * error handling, and retry logic.
 */
export declare const rnArch001: EngineeringRule;
/**
 * React Native components must be functional components with hooks.
 * Class components are deprecated in new code and don't work with
 * React Server Components or the new architecture.
 */
export declare const rnArch002: EngineeringRule;
/**
 * Explicit `any` types defeat TypeScript's type safety.
 * Use `unknown`, specific types, or generics instead.
 */
export declare const rnTs001: EngineeringRule;
/**
 * Deprecated React Native APIs cause warnings, crashes, or are
 * removed in the new architecture. Use modern alternatives.
 */
export declare const rnRn001: EngineeringRule;
/**
 * Inline arrow functions as renderItem, keyExtractor, or other
 * FlatList callbacks cause unnecessary re-renders on every render.
 * Extract them as stable references with useCallback.
 */
export declare const rnPerf001: EngineeringRule;
/**
 * Redux state must be immutable. Direct mutation causes missed
 * re-renders and undefined behavior. Use Redux Toolkit's Immer-based
 * reducers or spread operators.
 */
export declare const rnState001: EngineeringRule;
/**
 * Secrets, API keys, and tokens must never be hardcoded in source code.
 * Use environment variables or a secure vault.
 */
export declare const rnSec001: EngineeringRule;
/**
 * NativeModules access must go through an approved wrapper module
 * to ensure type safety, error handling, and consistent API.
 */
export declare const rnNative001: EngineeringRule;
/**
 * Critical components and business logic must have corresponding
 * test files. This rule checks for the existence of test files.
 */
export declare const rnTest001: EngineeringRule;
/**
 * Dependencies must use supported versions. Check for known
 * problematic version patterns in package.json.
 */
export declare const rnBuild001: EngineeringRule;
/**
 * console.log/debug/info statements should not ship to production.
 * They leak information and degrade performance.
 */
export declare const rnSec002: EngineeringRule;
/**
 * All 10+ real RN rules, ready to register into a RuleRegistry.
 */
export declare const rnRules: EngineeringRule[];
