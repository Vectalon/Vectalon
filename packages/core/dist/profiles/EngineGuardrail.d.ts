/**
 * EngineGuardrail — Pluggable rule enforcement
 * Business Source License 1.1 (BSL-1.1)
 *
 * Accepts code/project changes, executes applicable rules via
 * pluggable detectors, and returns structured violations.
 *
 * ## Architecture
 *
 * ```
 * Change (file + diff)
 *   |
 *   v
 * Rule Matching (appliesTo patterns)
 *   |
 *   v
 * Detector Dispatch (regex, AST, build-config, ...)
 *   |
 *   v
 * Finding Collection
 *   |
 *   v
 * Validation Decision (allowed / blocked)
 * ```
 *
 * Detection logic lives in **Detectors** (plugins), not in the engine.
 * The engine orchestrates: it matches rules to files, delegates to
 * detectors, and aggregates results.
 *
 * ## Usage
 *
 * ```ts
 * const engine = new EngineGuardrail({
 *   detectors: [new RegexDetector(), new FileMatchDetector()],
 * })
 * engine.registerRules(rnRules)
 *
 * const result = await engine.validate({
 *   path: 'src/api.ts',
 *   content: fetch('https://...'),
 *   language: 'typescript',
 * })
 *
 * if (!result.allowed) {
 *   // agent must repair
 * }
 * ```
 */
import type { EngineeringRule, RuleSeverity } from './EngineeringRule';
import type { SourceFile } from '../platform/GuardrailEngine';
import type { Violation } from './Violation';
export type { Violation } from './Violation';
/**
 * A file change submitted for validation.
 */
export interface Change {
    path: string;
    content: string;
    language?: string;
    /** Optional diff — if provided, detectors can focus on changed lines */
    diff?: string;
}
/**
 * Validation result — the outcome of checking a change against all rules.
 */
export interface GuardrailValidationResult {
    /** Whether the change is allowed to proceed */
    allowed: boolean;
    /** All violations found */
    violations: Violation[];
    /** Summary metrics */
    summary: GuardrailValidationSummary;
    /** How long validation took (ms) */
    duration: number;
    /** Number of rules that were checked */
    rulesChecked: number;
    /** Number of detectors that were applied */
    detectorsApplied: number;
}
/**
 * Summary of validation findings by severity.
 */
export interface GuardrailValidationSummary {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
    /** Number of rules blocked (severity = 'block') */
    blocked: number;
}
/**
 * A pluggable detector that knows how to find violations
 * for a specific detection strategy.
 */
export interface Detector {
    /** Unique id for this detector type */
    readonly id: string;
    /** Human-readable name */
    readonly name: string;
    /**
     * Can this detector handle the given rule?
     * Called before detect() to check applicability.
     */
    canDetect(rule: EngineeringRule): boolean;
    /**
     * Run detection for a rule against a file.
     * Returns violations found.
     */
    detect(rule: EngineeringRule, file: SourceFile): Violation[];
}
/**
 * Engine configuration.
 */
export interface EngineConfig {
    /** Pluggable detectors for rule execution */
    detectors?: Detector[];
    /**
     * Default onViolation behavior.
     * 'block' = any error-level finding blocks the change.
     * 'warn' = all findings are reported but never block.
     */
    onViolation?: 'block' | 'warn';
    /**
     * Severity levels that cause `allowed: false`.
     * Defaults to ['error', 'block'].
     */
    blockingSeverities?: RuleSeverity[];
}
/**
 * RegexDetector — scans file content line-by-line using the rule's
 * detection pattern (or check function for regex-detected rules).
 */
export declare class RegexDetector implements Detector {
    readonly id = "regex";
    readonly name = "Regex Pattern Detector";
    canDetect(rule: EngineeringRule): boolean;
    detect(rule: EngineeringRule, file: SourceFile): Violation[];
}
/**
 * FileMatchDetector — checks if a file matches a rule's appliesTo
 * patterns. Used for file-existence rules (e.g., "every component
 * must have a test file").
 */
export declare class FileMatchDetector implements Detector {
    readonly id = "file-match";
    readonly name = "File Match Detector";
    canDetect(rule: EngineeringRule): boolean;
    detect(rule: EngineeringRule, file: SourceFile): Violation[];
}
/**
 * EngineGuardrail — orchestrates rule enforcement.
 *
 * Design:
 * - Stateful: accumulates rules and detectors.
 * - Async: validate() is async for future AST/file-system detectors.
 * - Deterministic: same inputs always produce the same output.
 */
export declare class EngineGuardrail {
    private rules;
    private detectors;
    private config;
    constructor(config?: EngineConfig);
    /**
     * Register a rule for enforcement.
     */
    registerRule(rule: EngineeringRule): void;
    /**
     * Register multiple rules at once.
     */
    registerRules(rules: EngineeringRule[]): void;
    /**
     * Clear all registered rules.
     */
    clearRules(): void;
    /**
     * Get all registered rules.
     */
    getRules(): EngineeringRule[];
    /**
     * Add a detector plugin.
     */
    addDetector(detector: Detector): void;
    /**
     * Validate a single file change against all registered rules.
     */
    validate(change: Change): Promise<GuardrailValidationResult>;
    /**
     * Validate multiple file changes at once.
     */
    validateAll(changes: Change[]): Promise<GuardrailValidationResult>;
    /**
     * Validate against a specific subset of rules.
     */
    validateWithRules(change: Change, ruleIds: string[]): Promise<GuardrailValidationResult>;
    /**
     * Find rules that apply to the given file (based on appliesTo patterns).
     */
    private findApplicableRules;
    /**
     * Find the best detector for a rule.
     */
    private findDetector;
    /**
     * Decide if a change is allowed based on violation summary.
     */
    private decideAllowed;
}
