"use strict";
/**
 * Vectalon Core — Shared infrastructure for all Vectalon products
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Bhishak Sanyal. Commercial use requires a paid license.
 * See LICENSE for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.frameworkProfiles = exports.FrameworkProfileRegistry = exports.typescriptDefinition = exports.isManualRemediation = exports.isSnippetRemediation = exports.isGuidanceRemediation = exports.isAutoFixRemediation = exports.isCompositeDetection = exports.isTestCoverageDetection = exports.isBuildConfigDetection = exports.isStaticAnalysisDetection = exports.isRegexDetection = exports.isASTDetection = exports.createRule = exports.languageProfiles = exports.LanguageProfileRegistry = exports.ruleRegistry = exports.RuleRegistry = exports.createToolCaller = exports.createAlwaysResponds = exports.FakeModelProvider = exports.modelProviders = exports.ModelRateLimitError = exports.ModelProviderError = exports.ModelProviderRegistry = exports.buildRepairPrompt = exports.RepairLoop = exports.FileMatchDetector = exports.RegexDetector = exports.EngineGuardrail = exports.violationsToPrompt = exports.violationToPrompt = exports.violationsFromJSON = exports.violationsToJSON = exports.violationDeserialize = exports.violationSerialize = exports.violationFromJSON = exports.violationToJSON = exports.createViolation = exports.CURRENT_SCHEMA_VERSION = exports.EngineeringProfile = exports.DevMode = exports.VectalonConfig = exports.UsageReporter = exports.requireTier = exports.FeatureGates = exports.TierResolver = exports.TrialTracker = exports.LicenseValidator = exports.LicenseStore = void 0;
exports.DEFAULT_PRECEDENCE = exports.LAYER_ORDER = exports.composeProfiles = exports.CompositionEngine = exports.androidDefinition = exports.iosDefinition = exports.platformProfiles = exports.PlatformProfileRegistry = exports.rnSec002 = exports.rnBuild001 = exports.rnTest001 = exports.rnNative001 = exports.rnSec001 = exports.rnState001 = exports.rnPerf001 = exports.rnRn001 = exports.rnTs001 = exports.rnArch002 = exports.rnArch001 = exports.rnRules = exports.reactNativeDefinition = exports.reactDefinition = void 0;
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
var react_native_1 = require("./profiles/frameworks/react-native");
Object.defineProperty(exports, "reactNativeDefinition", { enumerable: true, get: function () { return react_native_1.reactNativeDefinition; } });
// Real RN rules (with working detection)
var react_native_rules_1 = require("./profiles/rules/react-native-rules");
Object.defineProperty(exports, "rnRules", { enumerable: true, get: function () { return react_native_rules_1.rnRules; } });
var react_native_rules_2 = require("./profiles/rules/react-native-rules");
Object.defineProperty(exports, "rnArch001", { enumerable: true, get: function () { return react_native_rules_2.rnArch001; } });
Object.defineProperty(exports, "rnArch002", { enumerable: true, get: function () { return react_native_rules_2.rnArch002; } });
Object.defineProperty(exports, "rnTs001", { enumerable: true, get: function () { return react_native_rules_2.rnTs001; } });
Object.defineProperty(exports, "rnRn001", { enumerable: true, get: function () { return react_native_rules_2.rnRn001; } });
Object.defineProperty(exports, "rnPerf001", { enumerable: true, get: function () { return react_native_rules_2.rnPerf001; } });
Object.defineProperty(exports, "rnState001", { enumerable: true, get: function () { return react_native_rules_2.rnState001; } });
Object.defineProperty(exports, "rnSec001", { enumerable: true, get: function () { return react_native_rules_2.rnSec001; } });
Object.defineProperty(exports, "rnNative001", { enumerable: true, get: function () { return react_native_rules_2.rnNative001; } });
Object.defineProperty(exports, "rnTest001", { enumerable: true, get: function () { return react_native_rules_2.rnTest001; } });
Object.defineProperty(exports, "rnBuild001", { enumerable: true, get: function () { return react_native_rules_2.rnBuild001; } });
Object.defineProperty(exports, "rnSec002", { enumerable: true, get: function () { return react_native_rules_2.rnSec002; } });
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
