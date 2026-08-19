import { type CompositionInput } from './CompositionEngine';
import type { EngineeringRule, RuleSeverity } from './EngineeringRule';
import type { ModelCapabilities, ModelProvider } from './ModelProvider';
import type { ProjectProfile } from './types';
export type HarnessStatus = 'passed' | 'blocked' | 'repaired' | 'failed';
export type HarnessReason = 'PASSED' | 'DISCOVERY_FAILED' | 'RULE_UNAVAILABLE' | 'RULE_EXECUTION_FAILED' | 'GUARDRAIL_BLOCKED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_FAILED' | 'REPAIR_SUCCEEDED' | 'REPAIR_EXHAUSTED' | 'INVALID_REQUEST';
export interface HarnessChange {
    id: string;
    relativePath: string;
    content: string;
}
export interface HarnessRequest {
    runId: string;
    capabilityId: string;
    projectLocator: string;
    profileInputs: readonly CompositionInput[];
    changes: readonly HarnessChange[];
    requiredProviderCapabilities?: Partial<ModelCapabilities>;
    repair?: {
        enabled: boolean;
        maxAttempts: number;
    };
}
export interface HarnessDiscoveryDiagnostic {
    code: string;
    severity: 'info' | 'warning' | 'error';
}
export interface HarnessDiscoveryResult {
    project: ProjectProfile;
    diagnostics: readonly HarnessDiscoveryDiagnostic[];
}
export interface ProjectDiscoveryAdapter {
    discover(input: {
        projectLocator: string;
    }): Promise<HarnessDiscoveryResult>;
}
export interface HarnessRuleViolation {
    code: string;
    severity: RuleSeverity;
    line?: number;
    column?: number;
}
export interface RuleExecutionAdapter {
    supports?(rule: EngineeringRule): boolean;
    execute(input: {
        rule: EngineeringRule;
        change: HarnessChange;
        project: ProjectProfile;
    }): Promise<readonly HarnessRuleViolation[]>;
}
export interface HarnessClock {
    now(): string;
}
export interface HarnessAdapters {
    discovery: ProjectDiscoveryAdapter;
    ruleExecution: RuleExecutionAdapter;
    providers?: readonly ModelProvider[];
    clock: HarnessClock;
}
export interface HarnessConfig {
    coreRevision: string;
    profileSchemaVersion: string;
    resultSchemaVersion?: string;
    providerPriority?: readonly string[];
}
export interface HarnessSafeDiagnostic {
    code: string;
    severity: RuleSeverity;
    ruleId?: string;
    pathToken?: string;
    line?: number;
    column?: number;
}
export interface HarnessSafeResult {
    resultSchemaVersion: string;
    runId: string;
    capabilityId: string;
    status: HarnessStatus;
    reason: HarnessReason;
    coreRevision: string;
    contractRevision: string;
    profileSchemaVersion: string;
    selectedRules: ReadonlyArray<{
        id: string;
        version: string;
        provenance: string;
    }>;
    diagnostics: readonly HarnessSafeDiagnostic[];
    provider?: {
        id: string;
        model?: string;
        selectionReason: 'CONFIGURED_PRIORITY' | 'STABLE_ID';
    };
    repairCount: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    redaction: 'metadata-only';
}
export interface HarnessRun {
    local: {
        project?: ProjectProfile;
        changes: readonly HarnessChange[];
    };
    safe: HarnessSafeResult;
}
export interface CoreHarness {
    run(request: HarnessRequest): Promise<HarnessRun>;
}
export declare function createCoreHarness(config: HarnessConfig, adapters: HarnessAdapters): CoreHarness;
