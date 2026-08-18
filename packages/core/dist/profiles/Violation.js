"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createViolation = createViolation;
exports.violationToJSON = violationToJSON;
exports.violationFromJSON = violationFromJSON;
exports.violationSerialize = violationSerialize;
exports.violationDeserialize = violationDeserialize;
exports.violationsToJSON = violationsToJSON;
exports.violationsFromJSON = violationsFromJSON;
exports.violationToPrompt = violationToPrompt;
exports.violationsToPrompt = violationsToPrompt;
// ─── Helpers ──────────────────────────────────────────────────────────────
/**
 * Create a minimal violation with required fields.
 */
function createViolation(ruleId, severity, category, file, message, overrides = {}) {
    return {
        ruleId,
        ruleName: overrides.ruleName ?? ruleId,
        severity,
        category,
        message,
        file,
        detectedAt: new Date().toISOString(),
        ...overrides,
    };
}
/**
 * Serialize a Violation to JSON-safe object.
 */
function violationToJSON(v) {
    return {
        ruleId: v.ruleId,
        ruleName: v.ruleName,
        severity: v.severity,
        category: v.category,
        message: v.message,
        suggestion: v.suggestion,
        file: v.file,
        line: v.line,
        column: v.column,
        endLine: v.endLine,
        endColumn: v.endColumn,
        sourceCode: v.sourceCode,
        ruleVersion: v.ruleVersion,
        detectionType: v.detectionType,
        remediation: v.remediation
            ? { type: v.remediation.type, ...stripFunctions(v.remediation) }
            : undefined,
        tags: v.tags,
        docs: v.docs,
        autoFixable: v.autoFixable,
        layer: v.layer,
        detector: v.detector,
        detectedAt: v.detectedAt,
        confidence: v.confidence,
    };
}
/**
 * Deserialize a JSON object back to a Violation.
 */
function violationFromJSON(json) {
    return {
        ruleId: json.ruleId,
        ruleName: json.ruleName,
        severity: json.ruleName ? json.severity : 'warning',
        category: json.category,
        message: json.message,
        suggestion: json.suggestion,
        file: json.file,
        line: json.line,
        column: json.column,
        endLine: json.endLine,
        endColumn: json.endColumn,
        sourceCode: json.sourceCode,
        ruleVersion: json.ruleVersion,
        detectionType: json.detectionType,
        remediation: json.remediation,
        tags: json.tags,
        docs: json.docs,
        autoFixable: json.autoFixable,
        layer: json.layer,
        detector: json.detector,
        detectedAt: json.detectedAt,
        confidence: json.confidence,
    };
}
/**
 * Serialize a Violation to a JSON string.
 */
function violationSerialize(v) {
    return JSON.stringify(violationToJSON(v), null, 2);
}
/**
 * Deserialize a Violation from a JSON string.
 */
function violationDeserialize(jsonString) {
    return violationFromJSON(JSON.parse(jsonString));
}
// ─── Batch serialization ──────────────────────────────────────────────────
/**
 * Serialize multiple violations to JSON.
 */
function violationsToJSON(violations) {
    return violations.map(violationToJSON);
}
/**
 * Deserialize multiple violations from JSON.
 */
function violationsFromJSON(json) {
    return json.map(violationFromJSON);
}
// ─── LLM-friendly output ──────────────────────────────────────────────────
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
function violationToPrompt(v) {
    const location = v.line ? `${v.file}:${v.line}` : v.file;
    const parts = [
        `[${v.severity}] ${v.ruleId} in ${location}`,
        `  ${v.message}`,
    ];
    if (v.suggestion) {
        parts.push(`  Fix: ${v.suggestion}`);
    }
    if (v.sourceCode) {
        parts.push(`  Code: ${v.sourceCode.trim().split('\n')[0]}`);
    }
    return parts.join('\n');
}
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
function violationsToPrompt(violations) {
    if (violations.length === 0)
        return 'No violations found.';
    const errors = violations.filter(v => v.severity === 'error' || v.severity === 'block').length;
    const warnings = violations.filter(v => v.severity === 'warning').length;
    const infos = violations.filter(v => v.severity === 'info').length;
    const header = `GUARDRAIL VIOLATIONS (${violations.length} found, ${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}${infos > 0 ? `, ${infos} info` : ''}):`;
    const items = violations.map(v => violationToPrompt(v));
    return [header, '', ...items].join('\n');
}
// ─── Internal helpers ─────────────────────────────────────────────────────
function stripFunctions(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value !== 'function') {
            result[key] = value;
        }
    }
    return result;
}
