/**
 * Engineering Profile types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 *
 * Language-neutral specialization abstractions.
 * The first implementation is TypeScript, but the concepts are universal.
 */
import type { EngineeringRule } from './EngineeringRule';
/**
 * LanguageProfile — describes a programming language's characteristics.
 *
 * Covers syntax, idioms, typing, concurrency, error handling and
 * common anti-patterns. This is the only required sub-profile.
 */
export interface LanguageProfile {
    id: string;
    name: string;
    version?: string;
    rules?: string[];
    fileExtensions?: string[];
    parser?: string;
    features: LanguageFeatures;
    antiPatterns?: AntiPattern[];
    idioms?: string[];
    config?: Record<string, unknown>;
}
export interface LanguageFeatures {
    typing: 'static' | 'dynamic' | 'gradual' | 'inferred';
    concurrency: 'async-await' | 'threads' | 'actors' | 'goroutines' | 'event-loop' | 'none';
    errorHandling: 'exceptions' | 'result-type' | 'error-codes' | 'option-type' | 'mixed';
    moduleSystem: 'esm' | 'commonjs' | 'importmap' | 'mixed';
    nullSafety?: 'yes' | 'no' | 'optional';
    generics?: boolean;
    patternMatching?: boolean;
}
export interface AntiPattern {
    id: string;
    name: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
}
/**
 * FrameworkProfile — describes a framework's APIs, lifecycle, patterns and pitfalls.
 */
export interface FrameworkProfile {
    id: string;
    name: string;
    version?: string;
    language?: string;
    inherits?: string;
    rules?: RuleSet;
    lifecycle?: string[];
    patterns?: string[];
    pitfalls?: AntiPattern[];
    config?: Record<string, unknown>;
}
/**
 * PlatformProfile — describes a target platform's APIs, build systems,
 * compatibility requirements and runtime behavior.
 */
export interface PlatformProfile {
    id: string;
    name: string;
    version?: string;
    sdk?: string;
    buildSystem?: string;
    packageManagers?: string[];
    runtime?: string;
    fileExtensions?: string[];
    rules?: RuleSet;
    supportedArchitectures?: string[];
    config?: Record<string, unknown>;
}
/**
 * ProjectProfile — dynamically discovered project context.
 *
 * Produced by a Scanner that inspects the actual project on disk.
 * The harness populates this at runtime rather than hardcoding it.
 */
export interface ProjectProfile {
    name: string;
    version?: string;
    language: string;
    framework?: string;
    platform?: string;
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    features?: string[];
    constraints?: ProjectConstraint[];
}
export interface ProjectConstraint {
    id: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
}
/**
 * OrganizationProfile — enforceable engineering policies defined by an org.
 *
 * These become machine-readable rules rather than prompt suggestions.
 */
export interface OrganizationProfile {
    id: string;
    name?: string;
    policies: OrgPolicy[];
    config?: Record<string, unknown>;
}
export interface OrgPolicy {
    id: string;
    rule: string;
    severity: 'error' | 'warning' | 'info';
    appliesTo?: string[];
    detectable: boolean;
}
/**
 * ToolDefinition — describes a tool the agent may invoke.
 */
export interface ToolDefinition {
    id: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    dangerous?: boolean;
}
/**
 * RuleSet — machine-readable guardrail rules.
 * Reuses the existing GuardrailRule interface from platform/GuardrailEngine.
 */
export type RuleSet = EngineeringRule[];
/**
 * GuardrailSet — runtime guardrail configuration.
 */
export interface GuardrailSet {
    rules: RuleSet;
    onViolation?: 'block' | 'warn' | 'log';
    config?: Record<string, unknown>;
}
/**
 * ToolSet — available tools for the agent.
 */
export type ToolSet = ToolDefinition[];
/**
 * EngineeringProfile — the central composable specialization abstraction.
 *
 * Composes language, framework, platform, project, and organization
 * profiles with rules, guardrails, and tools to create a complete
 * engineering specialization for a model-agnostic harness.
 *
 * Example (React Native):
 * ```
 * typescript + react + react-native + iOS/Android + project rules + org policies
 * ```
 */
export interface EngineeringProfile {
    id: string;
    version: string;
    schemaVersion: number;
    language: LanguageProfile;
    framework?: FrameworkProfile;
    platforms?: PlatformProfile[];
    project?: ProjectProfile;
    organization?: OrganizationProfile;
    rules: RuleSet;
    guardrails: GuardrailSet;
    tools: ToolSet;
    metadata?: ProfileMetadata;
}
/**
 * ProfileMetadata — provenance and lifecycle information.
 */
export interface ProfileMetadata {
    createdAt?: string;
    updatedAt?: string;
    author?: string;
    description?: string;
    tags?: string[];
}
/**
 * ValidationResult — result of profile validation.
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
export interface ValidationError {
    path: string;
    message: string;
    severity: 'error' | 'warning';
}
