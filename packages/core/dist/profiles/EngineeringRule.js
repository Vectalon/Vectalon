"use strict";
/**
 * EngineeringRule — Machine-readable rule abstraction
 * Business Source License 1.1 (BSL-1.1)
 *
 * Replaces arbitrary string rule ids with a structured, machine-readable
 * rule model. Each rule carries metadata, severity, category, optional
 * detection strategy, and optional remediation guidance.
 *
 * Detection strategies:
 *   AST, Regex, StaticAnalysis, BuildConfig, TestCoverage, Composite
 *
 * Remediation strategies:
 *   AutoFix, Guidance, Snippet, Manual
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRule = createRule;
exports.isASTDetection = isASTDetection;
exports.isRegexDetection = isRegexDetection;
exports.isStaticAnalysisDetection = isStaticAnalysisDetection;
exports.isBuildConfigDetection = isBuildConfigDetection;
exports.isTestCoverageDetection = isTestCoverageDetection;
exports.isCompositeDetection = isCompositeDetection;
exports.isAutoFixRemediation = isAutoFixRemediation;
exports.isGuidanceRemediation = isGuidanceRemediation;
exports.isSnippetRemediation = isSnippetRemediation;
exports.isManualRemediation = isManualRemediation;
// -- Helpers --------------------------------------------------------------
function createRule(id, severity, category, description, overrides = {}) {
    return {
        id,
        version: '1.0.0',
        name: description,
        severity,
        category,
        description,
        check: () => [],
        ...overrides,
    };
}
// -- Type guards ----------------------------------------------------------
function isASTDetection(s) {
    return s.type === 'ast';
}
function isRegexDetection(s) {
    return s.type === 'regex';
}
function isStaticAnalysisDetection(s) {
    return s.type === 'static-analysis';
}
function isBuildConfigDetection(s) {
    return s.type === 'build-config';
}
function isTestCoverageDetection(s) {
    return s.type === 'test-coverage';
}
function isCompositeDetection(s) {
    return s.type === 'composite';
}
function isAutoFixRemediation(s) {
    return s.type === 'auto-fix';
}
function isGuidanceRemediation(s) {
    return s.type === 'guidance';
}
function isSnippetRemediation(s) {
    return s.type === 'snippet';
}
function isManualRemediation(s) {
    return s.type === 'manual';
}
