/**
 * Violation — Structured, serializable violation model
 * Business Source License 1.1 (BSL-1.1)
 *
 * Language-neutral. Designed for machine consumption by LLMs and tools.
 * Every field is serializable to JSON. The `toPrompt()` method generates
 * a model-friendly text representation.
 *
 * Example:
 * ```json
 * {
 *   "ruleId": "RN-ARCH-001",
 *   "severity": "error",
 *   "file": "src/api/User.ts",
 *   "line": 42,
 *   "column": 12,
 *   "message": "Network requests must use APIClient",
 *   "suggestion": "Move this request into APIClient"
 * }
 * ```
 */
import type { RuleSeverity, RuleCategory, RemediationStrategy } from './EngineeringRule';
/**
 * Violation — the atomic unit of guardrail feedback.
 *
 * Fully serializable. Designed so that:
 * - LLMs can read it as structured context
 * - Tools can display it in editors/terminals
 * - Agents can consume it for repair decisions
 */
export interface Violation {
    /** Rule that was violated, e.g. "RN-ARCH-001" */
    ruleId: string;
    /** Rule name, e.g. "No raw fetch calls" */
    ruleName: string;
    /** Severity when violated */
    severity: RuleSeverity;
    /** What aspect of code quality this addresses */
    category: RuleCategory;
    /** Human-readable description of the violation */
    message: string;
    /** Suggested fix (one-liner for LLM prompt context) */
    suggestion?: string;
    /** File path relative to project root */
    file: string;
    /** 1-based line number where the violation starts */
    line?: number;
    /** 1-based column number where the violation starts */
    column?: number;
    /** 1-based line number where the violation ends (for ranges) */
    endLine?: number;
    /** 1-based column number where the violation ends */
    endColumn?: number;
    /** The offending source code snippet (a few lines around the violation) */
    sourceCode?: string;
    /** Rule version that triggered this violation */
    ruleVersion?: string;
    /** Detection strategy that found this violation */
    detectionType?: string;
    /** Full remediation guidance, if available */
    remediation?: RemediationStrategy;
    /** Tags from the originating rule */
    tags?: string[];
    /** Documentation URL for the rule */
    docs?: string;
    /** Whether this violation is auto-fixable */
    autoFixable?: boolean;
    /** Which layer produced this violation (for composition engine) */
    layer?: string;
    /** Which detector found this violation */
    detector?: string;
    /** Timestamp when the violation was detected (ISO 8601) */
    detectedAt?: string;
    /** Confidence score (0-1) if the detector supports it */
    confidence?: number;
}
/**
 * Create a minimal violation with required fields.
 */
export declare function createViolation(ruleId: string, severity: RuleSeverity, category: RuleCategory, file: string, message: string, overrides?: Partial<Omit<Violation, 'ruleId' | 'severity' | 'category' | 'file' | 'message'>>): Violation;
/**
 * JSON-safe representation of a Violation.
 * All fields are primitive or plain objects — no functions, no Dates.
 */
export interface ViolationJSON {
    ruleId: string;
    ruleName: string;
    severity: string;
    category: string;
    message: string;
    suggestion?: string;
    file: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    sourceCode?: string;
    ruleVersion?: string;
    detectionType?: string;
    remediation?: {
        type: string;
        [key: string]: unknown;
    };
    tags?: string[];
    docs?: string;
    autoFixable?: boolean;
    layer?: string;
    detector?: string;
    detectedAt?: string;
    confidence?: number;
}
/**
 * Serialize a Violation to JSON-safe object.
 */
export declare function violationToJSON(v: Violation): ViolationJSON;
/**
 * Deserialize a JSON object back to a Violation.
 */
export declare function violationFromJSON(json: ViolationJSON): Violation;
/**
 * Serialize a Violation to a JSON string.
 */
export declare function violationSerialize(v: Violation): string;
/**
 * Deserialize a Violation from a JSON string.
 */
export declare function violationDeserialize(jsonString: string): Violation;
/**
 * Serialize multiple violations to JSON.
 */
export declare function violationsToJSON(violations: Violation[]): ViolationJSON[];
/**
 * Deserialize multiple violations from JSON.
 */
export declare function violationsFromJSON(json: ViolationJSON[]): Violation[];
/**
 * Generate a compact text representation for LLM prompt context.
 *
 * Example output:
 * ```
 * [error] RN-ARCH-001 in src/api/User.ts:42
 *   Network requests must use APIClient
 *   Fix: Move this request into APIClient
 * ```
 */
export declare function violationToPrompt(v: Violation): string;
/**
 * Generate a summary block for multiple violations, optimized for
 * inclusion in an LLM system prompt.
 *
 * Example:
 * ```
 * GUARDRAIL VIOLATIONS (3 found, 2 errors, 1 warning):
 *
 * [error] RN-ARCH-001 in src/api/User.ts:42
 *   Network requests must use APIClient
 *   Fix: Move this request into APIClient
 *
 * [error] RN-SEC-001 in src/config.ts:8
 *   Hardcoded secret detected
 *
 * [warning] RN-TS-001 in src/utils.ts:15
 *   Explicit `any` type detected
 * ```
 */
export declare function violationsToPrompt(violations: Violation[]): string;
