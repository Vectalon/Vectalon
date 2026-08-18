"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairLoop = void 0;
exports.buildRepairPrompt = buildRepairPrompt;
const Violation_1 = require("./Violation");
// ─── RepairLoop ───────────────────────────────────────────────────────────
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
class RepairLoop {
    config;
    constructor(config) {
        this.config = {
            maxAttempts: config.maxAttempts ?? 3,
            guardrail: config.guardrail,
            stopOnWarnings: config.stopOnWarnings ?? false,
            onAttempt: config.onAttempt,
            onComplete: config.onComplete,
        };
    }
    /**
     * Run the repair loop on a single file change.
     *
     * @param change - The initial code change to validate
     * @param repairFn - Callback that receives violations and returns repaired code
     * @returns RepairResult with full attempt history
     */
    async run(change, repairFn) {
        const loopStart = Date.now();
        const attempts = [];
        let currentCode = change.content;
        let currentValidation;
        let maxAttemptsReached = false;
        // Attempt 0: validate the original code
        currentValidation = await this.config.guardrail.validate(change);
        // Determine if repair is needed:
        // - Blocking violations (errors/blocks) always trigger repair
        // - Warnings trigger repair only when stopOnWarnings is true
        const hasBlockingViolations = !currentValidation.allowed;
        const hasAnyViolations = currentValidation.violations.length > 0;
        const needsRepair = hasBlockingViolations || (this.config.stopOnWarnings && hasAnyViolations);
        if (!needsRepair) {
            // No repair needed — code passes or only non-blocking warnings remain
            const result = {
                passed: !hasAnyViolations,
                bestCode: currentCode,
                originalCode: change.content,
                attempts: [],
                finalValidation: currentValidation,
                totalAttempts: 0,
                totalDuration: Date.now() - loopStart,
                maxAttemptsReached: false,
                filePath: change.path,
                remainingViolations: currentValidation.violations,
                improvement: {
                    initialViolations: currentValidation.violations.length,
                    finalViolations: currentValidation.violations.length,
                    fixed: 0,
                    introduced: 0,
                },
            };
            this.config.onComplete?.(result);
            return result;
        }
        const initialViolationCount = currentValidation.violations.length;
        // Repair loop
        for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
            const attemptStart = Date.now();
            // Once in the loop, continue while there are any violations
            if (!this.shouldContinue(currentValidation)) {
                break;
            }
            // Send violations to the LLM for repair
            let repairedCode;
            try {
                repairedCode = await repairFn(currentCode, currentValidation.violations, attempt);
            }
            catch (err) {
                // LLM failed to produce a repair — record the failure and stop
                const failedAttempt = {
                    attempt,
                    previousCode: currentCode,
                    code: currentCode, // unchanged
                    filePath: change.path,
                    validation: currentValidation,
                    passed: false,
                    duration: Date.now() - attemptStart,
                    timestamp: new Date().toISOString(),
                };
                attempts.push(failedAttempt);
                this.config.onAttempt?.(failedAttempt);
                break;
            }
            // Validate the repaired code
            const repairedChange = {
                ...change,
                content: repairedCode,
            };
            const repairedValidation = await this.config.guardrail.validate(repairedChange);
            const attemptRecord = {
                attempt,
                previousCode: currentCode,
                code: repairedCode,
                filePath: change.path,
                validation: repairedValidation,
                passed: repairedValidation.violations.length === 0,
                duration: Date.now() - attemptStart,
                timestamp: new Date().toISOString(),
            };
            attempts.push(attemptRecord);
            this.config.onAttempt?.(attemptRecord);
            currentCode = repairedCode;
            currentValidation = repairedValidation;
            if (repairedValidation.violations.length === 0) {
                // All violations fixed — we're done
                break;
            }
            if (attempt === this.config.maxAttempts) {
                maxAttemptsReached = true;
            }
        }
        const finalViolationCount = currentValidation.violations.length;
        const result = {
            passed: currentValidation.violations.length === 0,
            bestCode: currentCode,
            originalCode: change.content,
            attempts,
            finalValidation: currentValidation,
            totalAttempts: attempts.length,
            totalDuration: Date.now() - loopStart,
            maxAttemptsReached,
            filePath: change.path,
            remainingViolations: currentValidation.violations,
            improvement: {
                initialViolations: initialViolationCount,
                finalViolations: finalViolationCount,
                fixed: Math.max(0, initialViolationCount - finalViolationCount),
                introduced: Math.max(0, finalViolationCount - initialViolationCount),
            },
        };
        this.config.onComplete?.(result);
        return result;
    }
    /**
     * Run the repair loop on multiple file changes.
     */
    async runAll(changes, repairFn) {
        const results = [];
        for (const change of changes) {
            const wrappedRepair = (originalCode, violations, attempt) => repairFn(change.path, originalCode, violations, attempt);
            results.push(await this.run(change, wrappedRepair));
        }
        return results;
    }
    // ─── Internals ────────────────────────────────────────────────────────
    /**
     * Should the loop continue based on the current validation?
     * Once inside the loop, continue while there are any violations —
     * the goal is a completely clean result.
     */
    shouldContinue(validation) {
        return validation.violations.length > 0;
    }
}
exports.RepairLoop = RepairLoop;
// ─── Helpers ─────────────────────────────────────────────────────────────
/**
 * Build a prompt context for the LLM from a repair result.
 * Includes the original code, violations, and attempt history.
 */
function buildRepairPrompt(result) {
    const parts = [];
    parts.push(`FILE: ${result.filePath}`);
    parts.push('');
    if (!result.passed) {
        parts.push(`REPAIR FAILED after ${result.totalAttempts} attempt(s).`);
        parts.push(`Max attempts reached: ${result.maxAttemptsReached}`);
        parts.push('');
    }
    else {
        parts.push(`REPAIR SUCCEEDED after ${result.totalAttempts} attempt(s).`);
        parts.push('');
    }
    // Improvement summary
    parts.push(`Improvement: ${result.improvement.initialViolations} violations → ${result.improvement.finalViolations} violations` +
        ` (${result.improvement.fixed} fixed, ${result.improvement.introduced} new)`);
    parts.push('');
    // Remaining violations
    if (result.remainingViolations.length > 0) {
        parts.push((0, Violation_1.violationsToPrompt)(result.remainingViolations));
        parts.push('');
    }
    // Attempt history (last 3 for context)
    const recentAttempts = result.attempts.slice(-3);
    if (recentAttempts.length > 0) {
        parts.push('ATTEMPT HISTORY:');
        for (const a of recentAttempts) {
            const status = a.passed ? 'PASS' : 'FAIL';
            const violationCount = a.validation.violations.length;
            parts.push(`  Attempt ${a.attempt}: ${status} (${violationCount} violations, ${a.duration}ms)`);
        }
    }
    return parts.join('\n');
}
