/**
 * React Native Engineering Profile — proof-of-concept composition
 * Business Source License 1.1 (BSL-1.1)
 *
 * Demonstrates how language + framework + platform profiles compose
 * into a complete React Native specialization.
 */
import type { EngineeringProfile as IEngineeringProfile, ToolSet, GuardrailSet } from '../types';
export declare const rnRules: import("../types").RuleSet;
export declare const rnGuardrails: GuardrailSet;
export declare const rnTools: ToolSet;
/**
 * Pre-composed React Native engineering profile.
 *
 * Demonstrates the composition model:
 *   TypeScript + React + React Native + iOS/Android + rules + guardrails + tools
 */
export declare const reactNativeEngineeringProfile: IEngineeringProfile;
