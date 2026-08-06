/**
 * Vectalon Core — Shared infrastructure for all Vectalon products
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Bhishak Sanyal. Commercial use requires a paid license.
 * See LICENSE for details.
 */

// Auth
export { LicenseStore } from './auth/LicenseStore'
export { LicenseValidator } from './auth/LicenseValidator'
export { TrialTracker } from './auth/TrialTracker'
export type { LicenseInfo, TrialInfo } from './auth/types'

// Billing
export { TierResolver } from './billing/TierResolver'
export { FeatureGates, requireTier } from './billing/FeatureGates'
export type { Tier, TierCheck, Product, Feature } from './billing/types'

// Telemetry
export { UsageReporter } from './telemetry/UsageReporter'
export type { TelemetryEvent } from './telemetry/types'

// Config
export { VectalonConfig } from './config/VectalonConfig'
export type { ConfigOptions } from './config/types'

// Platform interfaces (for product implementations)
export type { Scanner, ProjectSnapshot } from './platform/Scanner'
export type { ContextEngine, PromptOptions } from './platform/ContextEngine'
export type { GuardrailEngine, GuardrailRule, GuardrailFinding } from './platform/GuardrailEngine'
export type { Parser, SourceFile, ASTNode, NodeVisitor } from './platform/Parser'
export type { Analyzer, AnalysisResult, Finding } from './platform/Analyzer'
