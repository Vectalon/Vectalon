/**
 * Vectalon Core — Shared infrastructure for all Vectalon products
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Bhishak Sanyal. Commercial use requires a paid license.
 * See LICENSE for details.
 */
export { LicenseStore } from './auth/LicenseStore';
export { LicenseValidator } from './auth/LicenseValidator';
export { TrialTracker } from './auth/TrialTracker';
export type { LicenseInfo, TrialInfo } from './auth/types';
export { TierResolver } from './billing/TierResolver';
export { FeatureGates, requireTier } from './billing/FeatureGates';
export type { Tier, TierCheck, Product, Feature } from './billing/types';
export { UsageReporter } from './telemetry/UsageReporter';
export type { TelemetryEvent } from './telemetry/types';
export { VectalonConfig } from './config/VectalonConfig';
export type { ConfigOptions } from './config/types';
export { DevMode } from './dev/DevMode';
export type { Scanner, ProjectSnapshot } from './platform/Scanner';
export type { ContextEngine, PromptOptions } from './platform/ContextEngine';
export type { GuardrailEngine, GuardrailRule, GuardrailFinding } from './platform/GuardrailEngine';
export type { Parser, SourceFile, ASTNode, NodeVisitor } from './platform/Parser';
export type { Analyzer, AnalysisResult, Finding } from './platform/Analyzer';
export { EngineeringProfile, CURRENT_SCHEMA_VERSION } from './profiles/EngineeringProfile';
export type { IEngineeringProfileJSON } from './profiles/EngineeringProfile';
export type { EngineeringProfile as EngineeringProfileInterface, LanguageProfile, LanguageFeatures, AntiPattern, FrameworkProfile, PlatformProfile, ProjectProfile, ProjectConstraint, OrganizationProfile, OrgPolicy, ToolDefinition, RuleSet, GuardrailSet, ToolSet, ProfileMetadata, ValidationResult, ValidationError, } from './profiles/types';
export { createViolation, violationToJSON, violationFromJSON, violationSerialize, violationDeserialize, violationsToJSON, violationsFromJSON, violationToPrompt, violationsToPrompt, } from './profiles/Violation';
export type { Violation, ViolationJSON } from './profiles/Violation';
export { EngineGuardrail, RegexDetector, FileMatchDetector } from './profiles/EngineGuardrail';
export type { Detector, Change, GuardrailValidationResult, GuardrailValidationSummary, EngineConfig, } from './profiles/EngineGuardrail';
export { RepairLoop, buildRepairPrompt } from './profiles/RepairLoop';
export type { RepairFunction, RepairConfig, RepairAttempt, RepairResult, } from './profiles/RepairLoop';
export { ModelProviderRegistry, ModelProviderError, ModelRateLimitError, modelProviders, } from './profiles/ModelProvider';
export type { ModelProvider, ModelCapabilities, ModelMessage, ModelTool, ModelToolCall, ModelRequest, ModelResponse, ModelUsage, ModelStreamChunk, } from './profiles/ModelProvider';
export { FakeModelProvider, createAlwaysResponds, createToolCaller } from './profiles/providers/fake';
export { RuleRegistry, ruleRegistry } from './profiles/RuleRegistry';
export type { RuleRegistration, RuleFilter, VersionCheck } from './profiles/RuleRegistry';
export { LanguageProfileRegistry, languageProfiles } from './profiles/LanguageProfileRegistry';
export type { LanguageRegistration } from './profiles/LanguageProfileRegistry';
export { createRule, isASTDetection, isRegexDetection, isStaticAnalysisDetection, isBuildConfigDetection, isTestCoverageDetection, isCompositeDetection, isAutoFixRemediation, isGuidanceRemediation, isSnippetRemediation, isManualRemediation, } from './profiles/EngineeringRule';
export type { EngineeringRule, RuleSeverity, RuleCategory, DetectionStrategy, ASTDetection, RegexDetection, StaticAnalysisDetection, BuildConfigDetection, TestCoverageDetection, CompositeDetection, RemediationStrategy, AutoFixRemediation, GuidanceRemediation, SnippetRemediation, ManualRemediation, } from './profiles/EngineeringRule';
export { typescriptDefinition } from './profiles/languages/typescript';
export { FrameworkProfileRegistry, frameworkProfiles } from './profiles/FrameworkProfileRegistry';
export type { FrameworkRegistration, ResolvedRules } from './profiles/FrameworkProfileRegistry';
export { reactDefinition } from './profiles/frameworks/react';
export { reactNativeDefinition } from './profiles/frameworks/react-native';
export { rnRules } from './profiles/rules/react-native-rules';
export { rnArch001, rnArch002, rnTs001, rnRn001, rnPerf001, rnState001, rnSec001, rnNative001, rnTest001, rnBuild001, rnSec002, } from './profiles/rules/react-native-rules';
export { PlatformProfileRegistry, platformProfiles } from './profiles/PlatformProfileRegistry';
export type { PlatformRegistration, ResolvedPlatforms } from './profiles/PlatformProfileRegistry';
export { iosDefinition } from './profiles/platforms/ios';
export { androidDefinition } from './profiles/platforms/android';
export { CompositionEngine, composeProfiles, LAYER_ORDER, DEFAULT_PRECEDENCE } from './profiles/CompositionEngine';
export type { CompositionLayer, PrecedenceMap, CompositionInput, CompositionConflict, RuleProvenance, CompositionOptions, CompositionResult, } from './profiles/CompositionEngine';
