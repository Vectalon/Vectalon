"use strict";
/**
 * Vectalon Core — Shared infrastructure for all Vectalon products
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Bhishak Sanyal. Commercial use requires a paid license.
 * See LICENSE for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCompositeDetection = exports.isTestCoverageDetection = exports.isBuildConfigDetection = exports.isStaticAnalysisDetection = exports.isRegexDetection = exports.isASTDetection = exports.createRule = exports.languageProfiles = exports.LanguageProfileRegistry = exports.ruleRegistry = exports.RuleRegistry = exports.createToolCaller = exports.createAlwaysResponds = exports.FakeModelProvider = exports.modelProviders = exports.ModelRateLimitError = exports.ModelProviderError = exports.ModelProviderRegistry = exports.buildRepairPrompt = exports.RepairLoop = exports.FileMatchDetector = exports.RegexDetector = exports.EngineGuardrail = exports.violationsToPrompt = exports.violationToPrompt = exports.violationsFromJSON = exports.violationsToJSON = exports.violationDeserialize = exports.violationSerialize = exports.violationFromJSON = exports.violationToJSON = exports.createViolation = exports.CURRENT_SCHEMA_VERSION = exports.EngineeringProfile = exports.validateContract = exports.findBreakingSchemaChanges = exports.generateRegistryManifest = exports.generateContractTypes = exports.CONTRACT_SCHEMAS = exports.CONTRACT_REVISION = exports.CONTRACT_NAMES = exports.DevMode = exports.VectalonConfig = exports.UsageReporter = exports.requireTier = exports.FeatureGates = exports.TierResolver = exports.TrialTracker = exports.LicenseValidator = exports.LicenseStore = void 0;
exports.createCoreHarness = exports.DEFAULT_PRECEDENCE = exports.LAYER_ORDER = exports.composeProfiles = exports.CompositionEngine = exports.androidDefinition = exports.iosDefinition = exports.platformProfiles = exports.PlatformProfileRegistry = exports.reactDefinition = exports.frameworkProfiles = exports.FrameworkProfileRegistry = exports.typescriptDefinition = exports.isManualRemediation = exports.isSnippetRemediation = exports.isGuidanceRemediation = exports.isAutoFixRemediation = void 0;
// Auth
var LicenseStore_1 = require("./auth/LicenseStore");
Object.defineProperty(exports, "LicenseStore", { enumerable: true, get: function () { return LicenseStore_1.LicenseStore; } });
var LicenseValidator_1 = require("./auth/LicenseValidator");
Object.defineProperty(exports, "LicenseValidator", { enumerable: true, get: function () { return LicenseValidator_1.LicenseValidator; } });
var TrialTracker_1 = require("./auth/TrialTracker");
Object.defineProperty(exports, "TrialTracker", { enumerable: true, get: function () { return TrialTracker_1.TrialTracker; } });
// Billing
var TierResolver_1 = require("./billing/TierResolver");
Object.defineProperty(exports, "TierResolver", { enumerable: true, get: function () { return TierResolver_1.TierResolver; } });
var FeatureGates_1 = require("./billing/FeatureGates");
Object.defineProperty(exports, "FeatureGates", { enumerable: true, get: function () { return FeatureGates_1.FeatureGates; } });
Object.defineProperty(exports, "requireTier", { enumerable: true, get: function () { return FeatureGates_1.requireTier; } });
// Telemetry
var UsageReporter_1 = require("./telemetry/UsageReporter");
Object.defineProperty(exports, "UsageReporter", { enumerable: true, get: function () { return UsageReporter_1.UsageReporter; } });
// Config
var VectalonConfig_1 = require("./config/VectalonConfig");
Object.defineProperty(exports, "VectalonConfig", { enumerable: true, get: function () { return VectalonConfig_1.VectalonConfig; } });
// Dev mode
var DevMode_1 = require("./dev/DevMode");
Object.defineProperty(exports, "DevMode", { enumerable: true, get: function () { return DevMode_1.DevMode; } });
// Versioned cross-language contracts
var contracts_1 = require("./contracts");
Object.defineProperty(exports, "CONTRACT_NAMES", { enumerable: true, get: function () { return contracts_1.CONTRACT_NAMES; } });
Object.defineProperty(exports, "CONTRACT_REVISION", { enumerable: true, get: function () { return contracts_1.CONTRACT_REVISION; } });
Object.defineProperty(exports, "CONTRACT_SCHEMAS", { enumerable: true, get: function () { return contracts_1.CONTRACT_SCHEMAS; } });
Object.defineProperty(exports, "generateContractTypes", { enumerable: true, get: function () { return contracts_1.generateContractTypes; } });
Object.defineProperty(exports, "generateRegistryManifest", { enumerable: true, get: function () { return contracts_1.generateRegistryManifest; } });
Object.defineProperty(exports, "findBreakingSchemaChanges", { enumerable: true, get: function () { return contracts_1.findBreakingSchemaChanges; } });
Object.defineProperty(exports, "validateContract", { enumerable: true, get: function () { return contracts_1.validateContract; } });
// Engineering Profiles
var EngineeringProfile_1 = require("./profiles/EngineeringProfile");
Object.defineProperty(exports, "EngineeringProfile", { enumerable: true, get: function () { return EngineeringProfile_1.EngineeringProfile; } });
Object.defineProperty(exports, "CURRENT_SCHEMA_VERSION", { enumerable: true, get: function () { return EngineeringProfile_1.CURRENT_SCHEMA_VERSION; } });
// Violation (structured violation model for LLM consumption)
var Violation_1 = require("./profiles/Violation");
Object.defineProperty(exports, "createViolation", { enumerable: true, get: function () { return Violation_1.createViolation; } });
Object.defineProperty(exports, "violationToJSON", { enumerable: true, get: function () { return Violation_1.violationToJSON; } });
Object.defineProperty(exports, "violationFromJSON", { enumerable: true, get: function () { return Violation_1.violationFromJSON; } });
Object.defineProperty(exports, "violationSerialize", { enumerable: true, get: function () { return Violation_1.violationSerialize; } });
Object.defineProperty(exports, "violationDeserialize", { enumerable: true, get: function () { return Violation_1.violationDeserialize; } });
Object.defineProperty(exports, "violationsToJSON", { enumerable: true, get: function () { return Violation_1.violationsToJSON; } });
Object.defineProperty(exports, "violationsFromJSON", { enumerable: true, get: function () { return Violation_1.violationsFromJSON; } });
Object.defineProperty(exports, "violationToPrompt", { enumerable: true, get: function () { return Violation_1.violationToPrompt; } });
Object.defineProperty(exports, "violationsToPrompt", { enumerable: true, get: function () { return Violation_1.violationsToPrompt; } });
// Guardrail Engine (pluggable rule enforcement)
var EngineGuardrail_1 = require("./profiles/EngineGuardrail");
Object.defineProperty(exports, "EngineGuardrail", { enumerable: true, get: function () { return EngineGuardrail_1.EngineGuardrail; } });
Object.defineProperty(exports, "RegexDetector", { enumerable: true, get: function () { return EngineGuardrail_1.RegexDetector; } });
Object.defineProperty(exports, "FileMatchDetector", { enumerable: true, get: function () { return EngineGuardrail_1.FileMatchDetector; } });
// Repair Loop (bounded closed-loop repair)
var RepairLoop_1 = require("./profiles/RepairLoop");
Object.defineProperty(exports, "RepairLoop", { enumerable: true, get: function () { return RepairLoop_1.RepairLoop; } });
Object.defineProperty(exports, "buildRepairPrompt", { enumerable: true, get: function () { return RepairLoop_1.buildRepairPrompt; } });
// Model Provider (model-agnostic provider abstraction)
var ModelProvider_1 = require("./profiles/ModelProvider");
Object.defineProperty(exports, "ModelProviderRegistry", { enumerable: true, get: function () { return ModelProvider_1.ModelProviderRegistry; } });
Object.defineProperty(exports, "ModelProviderError", { enumerable: true, get: function () { return ModelProvider_1.ModelProviderError; } });
Object.defineProperty(exports, "ModelRateLimitError", { enumerable: true, get: function () { return ModelProvider_1.ModelRateLimitError; } });
Object.defineProperty(exports, "modelProviders", { enumerable: true, get: function () { return ModelProvider_1.modelProviders; } });
var fake_1 = require("./profiles/providers/fake");
Object.defineProperty(exports, "FakeModelProvider", { enumerable: true, get: function () { return fake_1.FakeModelProvider; } });
Object.defineProperty(exports, "createAlwaysResponds", { enumerable: true, get: function () { return fake_1.createAlwaysResponds; } });
Object.defineProperty(exports, "createToolCaller", { enumerable: true, get: function () { return fake_1.createToolCaller; } });
// Rule Registry (versioned rule store)
var RuleRegistry_1 = require("./profiles/RuleRegistry");
Object.defineProperty(exports, "RuleRegistry", { enumerable: true, get: function () { return RuleRegistry_1.RuleRegistry; } });
Object.defineProperty(exports, "ruleRegistry", { enumerable: true, get: function () { return RuleRegistry_1.ruleRegistry; } });
// Language Profile Registry (plugin system)
var LanguageProfileRegistry_1 = require("./profiles/LanguageProfileRegistry");
Object.defineProperty(exports, "LanguageProfileRegistry", { enumerable: true, get: function () { return LanguageProfileRegistry_1.LanguageProfileRegistry; } });
Object.defineProperty(exports, "languageProfiles", { enumerable: true, get: function () { return LanguageProfileRegistry_1.languageProfiles; } });
// Engineering Rule (machine-readable rule abstraction)
var EngineeringRule_1 = require("./profiles/EngineeringRule");
Object.defineProperty(exports, "createRule", { enumerable: true, get: function () { return EngineeringRule_1.createRule; } });
Object.defineProperty(exports, "isASTDetection", { enumerable: true, get: function () { return EngineeringRule_1.isASTDetection; } });
Object.defineProperty(exports, "isRegexDetection", { enumerable: true, get: function () { return EngineeringRule_1.isRegexDetection; } });
Object.defineProperty(exports, "isStaticAnalysisDetection", { enumerable: true, get: function () { return EngineeringRule_1.isStaticAnalysisDetection; } });
Object.defineProperty(exports, "isBuildConfigDetection", { enumerable: true, get: function () { return EngineeringRule_1.isBuildConfigDetection; } });
Object.defineProperty(exports, "isTestCoverageDetection", { enumerable: true, get: function () { return EngineeringRule_1.isTestCoverageDetection; } });
Object.defineProperty(exports, "isCompositeDetection", { enumerable: true, get: function () { return EngineeringRule_1.isCompositeDetection; } });
Object.defineProperty(exports, "isAutoFixRemediation", { enumerable: true, get: function () { return EngineeringRule_1.isAutoFixRemediation; } });
Object.defineProperty(exports, "isGuidanceRemediation", { enumerable: true, get: function () { return EngineeringRule_1.isGuidanceRemediation; } });
Object.defineProperty(exports, "isSnippetRemediation", { enumerable: true, get: function () { return EngineeringRule_1.isSnippetRemediation; } });
Object.defineProperty(exports, "isManualRemediation", { enumerable: true, get: function () { return EngineeringRule_1.isManualRemediation; } });
// Language definitions (first-class plugins)
var typescript_1 = require("./profiles/languages/typescript");
Object.defineProperty(exports, "typescriptDefinition", { enumerable: true, get: function () { return typescript_1.typescriptDefinition; } });
// Framework Profile Registry (plugin system)
var FrameworkProfileRegistry_1 = require("./profiles/FrameworkProfileRegistry");
Object.defineProperty(exports, "FrameworkProfileRegistry", { enumerable: true, get: function () { return FrameworkProfileRegistry_1.FrameworkProfileRegistry; } });
Object.defineProperty(exports, "frameworkProfiles", { enumerable: true, get: function () { return FrameworkProfileRegistry_1.frameworkProfiles; } });
// Framework definitions (first-class plugins)
var react_1 = require("./profiles/frameworks/react");
Object.defineProperty(exports, "reactDefinition", { enumerable: true, get: function () { return react_1.reactDefinition; } });
// Platform Profile Registry (plugin system)
var PlatformProfileRegistry_1 = require("./profiles/PlatformProfileRegistry");
Object.defineProperty(exports, "PlatformProfileRegistry", { enumerable: true, get: function () { return PlatformProfileRegistry_1.PlatformProfileRegistry; } });
Object.defineProperty(exports, "platformProfiles", { enumerable: true, get: function () { return PlatformProfileRegistry_1.platformProfiles; } });
// Platform definitions (first-class plugins)
var ios_1 = require("./profiles/platforms/ios");
Object.defineProperty(exports, "iosDefinition", { enumerable: true, get: function () { return ios_1.iosDefinition; } });
var android_1 = require("./profiles/platforms/android");
Object.defineProperty(exports, "androidDefinition", { enumerable: true, get: function () { return android_1.androidDefinition; } });
// Composition Engine (profile composition with conflict resolution)
var CompositionEngine_1 = require("./profiles/CompositionEngine");
Object.defineProperty(exports, "CompositionEngine", { enumerable: true, get: function () { return CompositionEngine_1.CompositionEngine; } });
Object.defineProperty(exports, "composeProfiles", { enumerable: true, get: function () { return CompositionEngine_1.composeProfiles; } });
Object.defineProperty(exports, "LAYER_ORDER", { enumerable: true, get: function () { return CompositionEngine_1.LAYER_ORDER; } });
Object.defineProperty(exports, "DEFAULT_PRECEDENCE", { enumerable: true, get: function () { return CompositionEngine_1.DEFAULT_PRECEDENCE; } });
// Product-neutral engineering harness
var CoreHarness_1 = require("./profiles/CoreHarness");
Object.defineProperty(exports, "createCoreHarness", { enumerable: true, get: function () { return CoreHarness_1.createCoreHarness; } });
