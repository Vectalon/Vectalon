// Generated from Vectalon Core contracts. Do not edit.

export interface Capability {
  contractVersion: '1.0.0'
  id: string
  status: 'available' | 'beta' | 'planned' | 'disabled'
  description?: string
}

export interface CapabilityCatalog {
  contractVersion: '1.0.0'
  productId: string
  productVersion: string
  capabilities: { id: string; version: string; lifecycle: 'planned' | 'experimental' | 'beta' | 'release-candidate' | 'available' | 'deprecated' | 'removed'; implemented: boolean; owner: { name: string; repository: string }; outcome: string; support: { productVersions: { min: string; maxExclusive?: string }; plans: string[]; platforms: string[]; tier: string }; dependencies: string[]; failureModes: string[]; performanceBudget: { metric: string; limit: number; unit: string }; tests: string[]; docs: string[]; evidence: { kind: 'implementation' | 'customer-workflow' | 'failure-mode' | 'performance' | 'support'; status: 'passed' | 'failed' | 'pending'; reference: string; digest?: string; recordedAt: string; productVersion: string; capabilityVersion: string }[]; deprecation?: { noticeVersion: string; noticeReference: string; migrationReference: string; removalVersion: string; licenseEffect: string } }[]
}

export interface DiagnosticResult {
  contractVersion: '1.0.0'
  id: string
  createdAt: string
  status: 'pass' | 'warn' | 'fail'
  diagnostics: { code: string; severity: 'info' | 'warning' | 'error'; message: string }[]
}

export interface EntitlementDecision {
  contractVersion: '1.0.0'
  decisionId: string
  subjectId: string
  capabilityId: string
  allowed: boolean
  decidedAt: string
  reason: string
}

export interface ErrorEnvelope {
  contractVersion: '1.0.0'
  ok: false
  error: { code: string; message: string; retryable: boolean; requestId?: string; details?: Record<string, unknown> }
}

export interface IdentityReference {
  contractVersion: '1.0.0'
  subjectId: string
  provider: string
  providerSubjectId: string
  displayName?: string
}

export interface LicenseClaims {
  contractVersion: '1.0.0'
  licenseId: string
  subjectId: string
  productScope: string[]
  tier: 'free' | 'pro' | 'team' | 'enterprise'
  issuedAt: string
  expiresAt: string
  seatQuantity?: number
}

export interface ProductDefinition {
  contractVersion: '1.0.0'
  schemaVersion?: number
  product: { id: string; name: string; releaseStatus: 'beta' | 'available' | 'retired'; flagship: string }
  packages: { reactNative: { name: string; version: string; status: 'beta' | 'available' | 'retired' }; core: { name: string; version: string; distribution: 'bundled-private-runtime' | 'package'; contractRevision: string } }
  platforms: { reactNative: 'beta' | 'available' | 'coming-soon' | 'retired'; ios: 'beta' | 'available' | 'coming-soon' | 'retired'; android: 'beta' | 'available' | 'coming-soon' | 'retired'; flutter: 'beta' | 'available' | 'coming-soon' | 'retired'; python: 'beta' | 'available' | 'coming-soon' | 'retired' }
  capabilities: { benchmarkScenarios: number; deterministicCommands: number; mcpTools: number }
  plans: { id: string; name: string; engineTier: 'free' | 'pro' | 'team' | 'enterprise'; price: { currency: string; minorUnits: number }; seatQuantity: { minimum: number; maximum: number | null; unit: 'developer' }; billingCadence: 'none' | 'monthly' | 'annual' | 'custom'; taxTreatment: 'exclusive' | 'inclusive' | 'not-applicable' | 'quoted'; trialEligibility: { eligible: boolean; durationDays?: number }; gracePolicy: { offlineDays: number; paymentFailureDays: number }; productScope: string[]; checkout: 'none' | 'checkout' | 'sales'; features: string[] }[]
  license: { id: string; freeCommercialDevelopers: number; changeDate: string; changeLicense: string; vscodeExtension: string }
  validation: { documents: { path: string; facts: string[] }[] }
}

export interface TelemetryEvent {
  contractVersion: '1.0.0'
  eventId: string
  event: string
  product: string
  occurredAt: string
  sessionId: string
  metadata?: Record<string, unknown>
}

export interface TrialCredential {
  contractVersion: '1.0.0'
  trialId: string
  subjectId: string
  productScope: string[]
  tier: 'pro' | 'team'
  issuedAt: string
  expiresAt: string
}
