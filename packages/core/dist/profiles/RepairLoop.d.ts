/**
 * RepairLoop — Bounded closed-loop repair
 * Business Source License 1.1 (BSL-1.1)
 *
 * After a generated change, run guardrails. If violations occur,
 * send structured violations back to the model and allow a
 * configurable maximum number of repair attempts. Prevents
 * infinite loops and preserves the original change for diagnostics.
 *
 * ## Flow
 *
 * ```
 * LLM generates code
 *       |
 *       v
 * Guardrail checks
 *       |
 *   +---+---+
 *   |       |
 * PASS    VIOLATIONS
 *   |       |
 *   |    Send violations to LLM
 *   |       |
 *   |    LLM repairs
 *   |       |
 *   +---+---+
 *       |
 *       v
 * Guardrail checks again
 *       |
 *   +---+---+
 *   |       |
 * PASS    VIOLATIONS (retry or give up)
 * ```
 *
 * ## Usage
 *
 * ```ts
 * const loop = new RepairLoop({
 *   maxAttempts: 3,
 *   guardrail: engine,
 * })
 *
 * const result = await loop.run({
 *   path: 'src/api.ts',
 *   content: 'fetch("/users")',
 * }, async (violations) => {
 *   // Call your LLM here with the violations
 *   return await llm.repair(originalCode, violations)
 * })
 *
 * if (result.passed) {
 *   // result.bestContent has the passing code
 * } else {
 *   // result.attempts has the full history
 * }
 * ```
 */
import type { Change, EngineGuardrail, GuardrailValidationResult } from './EngineGuardrail';
import type { Violation } from './Violation';
/**
 * Repair function — the LLM callback.
 * Receives structured violations and returns repaired code.
 */
export type RepairFunction = (originalCode: string, violations: Violation[], attempt: number) => Promise<string>;
/**
 * RepairLoop configuration.
 */
export interface RepairConfig {
    /** Maximum repair attempts before giving up. Default: 3. */
    maxAttempts?: number;
    /** The guardrail engine to check against. */
    guardrail: EngineGuardrail;
    /**
     * Whether to stop on warnings (not just errors).
     * Default: false — only errors/block trigger repair.
     */
    stopOnWarnings?: boolean;
    /**
     * Callback invoked after each attempt (for logging/telemetry).
     */
    onAttempt?: (attempt: RepairAttempt) => void;
    /**
     * Callback invoked when the loop completes (for logging/telemetry).
     */
    onComplete?: (result: RepairResult) => void;
}
/**
 * A single repair attempt — preserves the full history.
 */
export interface RepairAttempt {
    /** Attempt number (1-based) */
    attempt: number;
    /** The code before this attempt (empty string for first attempt) */
    previousCode: string;
    /** The code after this attempt */
    code: string;
    /** The file path being repaired */
    filePath: string;
    /** Validation result for this attempt */
    validation: GuardrailValidationResult;
    /** Whether this attempt passed */
    passed: boolean;
    /** Duration of this attempt (ms) */
    duration: number;
    /** Timestamp (ISO 8601) */
    timestamp: string;
}
/**
 * The final result of a repair loop.
 */
export interface RepairResult {
    /** Whether any attempt passed guardrails */
    passed: boolean;
    /** The best code (last attempt if none passed, or the passing one) */
    bestCode: string;
    /** The original code before any repairs */
    originalCode: string;
    /** All repair attempts in order */
    attempts: RepairAttempt[];
    /** Final validation result (from the last attempt) */
    finalValidation: GuardrailValidationResult;
    /** Total number of attempts made */
    totalAttempts: number;
    /** Total duration of the entire loop (ms) */
    totalDuration: number;
    /** Whether the loop hit the max attempts limit */
    maxAttemptsReached: boolean;
    /** The file path that was being repaired */
    filePath: string;
    /** Violations from the final attempt (empty if passed) */
    remainingViolations: Violation[];
    /** Summary: did the repair improve things? */
    improvement: {
        /** Starting violation count */
        initialViolations: number;
        /** Ending violation count */
        finalViolations: number;
        /** Violations fixed */
        fixed: number;
        /** New violations introduced */
        introduced: number;
    };
}
/**
 * RepairLoop — bounded closed-loop repair.
 *
 * Design:
 * - Bounded: configurable max attempts (default 3).
 * - Structured: violations are sent to the LLM as structured context.
 * - Diagnostic: every attempt is preserved for analysis.
 * - Deterministic: same inputs produce the same output.
 * - LLM-agnostic: the repair function is a callback.
 */
export declare class RepairLoop {
    private config;
    constructor(config: RepairConfig);
    /**
     * Run the repair loop on a single file change.
     *
     * @param change - The initial code change to validate
     * @param repairFn - Callback that receives violations and returns repaired code
     * @returns RepairResult with full attempt history
     */
    run(change: Change, repairFn: RepairFunction): Promise<RepairResult>;
    /**
     * Run the repair loop on multiple file changes.
     */
    runAll(changes: Change[], repairFn: (filePath: string, code: string, violations: Violation[], attempt: number) => Promise<string>): Promise<RepairResult[]>;
    /**
     * Should the loop continue based on the current validation?
     * Once inside the loop, continue while there are any violations —
     * the goal is a completely clean result.
     */
    private shouldContinue;
}
/**
 * Build a prompt context for the LLM from a repair result.
 * Includes the original code, violations, and attempt history.
 */
export declare function buildRepairPrompt(result: RepairResult): string;
