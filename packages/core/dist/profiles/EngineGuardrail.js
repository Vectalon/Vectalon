"use strict";
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
 * engine.registerRules(productRules)
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineGuardrail = exports.FileMatchDetector = exports.RegexDetector = void 0;
const Violation_1 = require("./Violation");
// ─── Built-in detectors ───────────────────────────────────────────────────
/**
 * RegexDetector — scans file content line-by-line using the rule's
 * detection pattern (or check function for regex-detected rules).
 */
class RegexDetector {
    id = 'regex';
    name = 'Regex Pattern Detector';
    canDetect(rule) {
        // Can detect any rule that has a check function
        // (all rules do — the check function is the primary detection mechanism)
        return typeof rule.check === 'function';
    }
    detect(rule, file) {
        // Delegate to the rule's check function — it knows its own regex
        const findings = rule.check(file, stubParser);
        return findings.map(f => {
            const location = extractLocation(f, file);
            return (0, Violation_1.createViolation)(rule.id, rule.severity, rule.category, location.file, f.message, {
                ruleName: rule.name,
                ruleVersion: rule.version,
                detectionType: rule.detection?.type,
                suggestion: extractSuggestion(rule),
                remediation: rule.remediation,
                tags: rule.tags,
                docs: rule.docs,
                autoFixable: rule.autoFixable,
                detector: 'regex',
                ...location,
            });
        });
    }
}
exports.RegexDetector = RegexDetector;
/**
 * FileMatchDetector — checks if a file matches a rule's appliesTo
 * patterns. Used for file-existence rules (e.g., "every component
 * must have a test file").
 */
class FileMatchDetector {
    id = 'file-match';
    name = 'File Match Detector';
    canDetect(rule) {
        return rule.detection?.type === 'test-coverage';
    }
    detect(rule, file) {
        // FileMatchDetector is metadata-only — the actual check
        // requires filesystem access (test file existence).
        // The engine delegates to the rule's check function for this.
        return [];
    }
}
exports.FileMatchDetector = FileMatchDetector;
// ─── Engine ───────────────────────────────────────────────────────────────
/**
 * EngineGuardrail — orchestrates rule enforcement.
 *
 * Design:
 * - Stateful: accumulates rules and detectors.
 * - Async: validate() is async for future AST/file-system detectors.
 * - Deterministic: same inputs always produce the same output.
 */
class EngineGuardrail {
    rules = [];
    detectors;
    config;
    constructor(config = {}) {
        this.detectors = config.detectors ?? [new RegexDetector()];
        this.config = {
            detectors: this.detectors,
            onViolation: config.onViolation ?? 'block',
            blockingSeverities: config.blockingSeverities ?? ['error', 'block'],
        };
    }
    // ─── Rule management ──────────────────────────────────────────────────
    /**
     * Register a rule for enforcement.
     */
    registerRule(rule) {
        this.rules.push(rule);
    }
    /**
     * Register multiple rules at once.
     */
    registerRules(rules) {
        this.rules.push(...rules);
    }
    /**
     * Clear all registered rules.
     */
    clearRules() {
        this.rules = [];
    }
    /**
     * Get all registered rules.
     */
    getRules() {
        return [...this.rules];
    }
    // ─── Detector management ──────────────────────────────────────────────
    /**
     * Add a detector plugin.
     */
    addDetector(detector) {
        this.detectors.push(detector);
    }
    // ─── Validation ───────────────────────────────────────────────────────
    /**
     * Validate a single file change against all registered rules.
     */
    async validate(change) {
        const start = Date.now();
        const file = {
            path: change.path,
            content: change.content,
            language: change.language ?? inferLanguage(change.path),
        };
        // Find applicable rules
        const applicable = this.findApplicableRules(file);
        const violations = [];
        let detectorsApplied = 0;
        for (const rule of applicable) {
            // Find the best detector for this rule
            const detector = this.findDetector(rule);
            if (!detector)
                continue;
            detectorsApplied++;
            const detected = detector.detect(rule, file);
            violations.push(...detected);
        }
        const summary = summarize(violations);
        const allowed = this.decideAllowed(summary);
        return {
            allowed,
            violations,
            summary,
            duration: Date.now() - start,
            rulesChecked: applicable.length,
            detectorsApplied,
        };
    }
    /**
     * Validate multiple file changes at once.
     */
    async validateAll(changes) {
        const start = Date.now();
        const allViolations = [];
        let totalRulesChecked = 0;
        let totalDetectorsApplied = 0;
        for (const change of changes) {
            const result = await this.validate(change);
            allViolations.push(...result.violations);
            totalRulesChecked += result.rulesChecked;
            totalDetectorsApplied += result.detectorsApplied;
        }
        const summary = summarize(allViolations);
        const allowed = this.decideAllowed(summary);
        return {
            allowed,
            violations: allViolations,
            summary,
            duration: Date.now() - start,
            rulesChecked: totalRulesChecked,
            detectorsApplied: totalDetectorsApplied,
        };
    }
    /**
     * Validate against a specific subset of rules.
     */
    async validateWithRules(change, ruleIds) {
        const start = Date.now();
        const file = {
            path: change.path,
            content: change.content,
            language: change.language ?? inferLanguage(change.path),
        };
        const applicable = this.findApplicableRules(file).filter(r => ruleIds.includes(r.id));
        const violations = [];
        let detectorsApplied = 0;
        for (const rule of applicable) {
            const detector = this.findDetector(rule);
            if (!detector)
                continue;
            detectorsApplied++;
            const detected = detector.detect(rule, file);
            violations.push(...detected);
        }
        const summary = summarize(violations);
        const allowed = this.decideAllowed(summary);
        return {
            allowed,
            violations,
            summary,
            duration: Date.now() - start,
            rulesChecked: applicable.length,
            detectorsApplied,
        };
    }
    // ─── Internals ────────────────────────────────────────────────────────
    /**
     * Find rules that apply to the given file (based on appliesTo patterns).
     */
    findApplicableRules(file) {
        return this.rules.filter(rule => {
            if (!rule.appliesTo || rule.appliesTo.length === 0)
                return true;
            return rule.appliesTo.some(pattern => matchesGlob(file.path, pattern));
        });
    }
    /**
     * Find the best detector for a rule.
     */
    findDetector(rule) {
        return this.detectors.find(d => d.canDetect(rule));
    }
    /**
     * Decide if a change is allowed based on violation summary.
     */
    decideAllowed(summary) {
        if (this.config.onViolation === 'warn')
            return true;
        if (summary.blocked > 0)
            return false;
        if (summary.errors > 0 && this.config.blockingSeverities.includes('error')) {
            return false;
        }
        return true;
    }
}
exports.EngineGuardrail = EngineGuardrail;
// ─── Helpers ─────────────────────────────────────────────────────────────
/**
 * Simple glob matching for appliesTo patterns.
 * Supports: star.ts, star.tsx, double-star/star.ts, exact paths.
 */
function matchesGlob(filePath, pattern) {
    // Normalize separators
    const normalised = filePath.split('\\').join('/');
    // Exact match
    if (pattern === normalised)
        return true;
    // **/ prefix means recursive
    if (pattern.startsWith('**/')) {
        const suffix = pattern.slice(3);
        return matchesSimpleGlob(normalised, suffix);
    }
    // Simple extension match: *.ts
    if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1);
        return normalised.endsWith(ext);
    }
    // Directory + extension: src/**/*.tsx
    if (pattern.includes('**/')) {
        const [, suffix] = pattern.split('**/');
        return matchesSimpleGlob(normalised, suffix);
    }
    // Prefix match
    return normalised.startsWith(pattern);
}
function matchesSimpleGlob(path, pattern) {
    if (pattern.startsWith('*.')) {
        return path.endsWith(pattern.slice(1));
    }
    return path.includes(pattern.replace(/^\//, ''));
}
function inferLanguage(path) {
    if (path.endsWith('.ts') || path.endsWith('.tsx'))
        return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx'))
        return 'javascript';
    if (path.endsWith('.swift'))
        return 'swift';
    if (path.endsWith('.kt') || path.endsWith('.java'))
        return 'kotlin';
    if (path.endsWith('.json'))
        return 'json';
    return 'unknown';
}
function extractLocation(f, file) {
    return {
        file: f.filePath ?? file.path,
        line: f.line,
        column: f.column,
    };
}
function extractSuggestion(rule) {
    if (!rule.remediation)
        return undefined;
    if (rule.remediation.type === 'guidance' && rule.remediation.steps?.length) {
        return rule.remediation.steps[0];
    }
    if (rule.remediation.type === 'auto-fix') {
        return rule.remediation.description;
    }
    if (rule.remediation.type === 'snippet') {
        return rule.remediation.description;
    }
    if (rule.remediation.type === 'manual' && rule.remediation.suggestion) {
        return rule.remediation.suggestion;
    }
    return undefined;
}
function summarize(violations) {
    const summary = {
        total: violations.length,
        errors: 0,
        warnings: 0,
        infos: 0,
        blocked: 0,
    };
    for (const v of violations) {
        switch (v.severity) {
            case 'error':
                summary.errors++;
                break;
            case 'warning':
                summary.warnings++;
                break;
            case 'info':
                summary.infos++;
                break;
            case 'block':
                summary.blocked++;
                break;
        }
    }
    return summary;
}
// ─── Stub parser (for rule check functions) ──────────────────────────────
/**
 * Minimal parser stub — satisfies the Parser interface for rule check()
 * functions that only use the file content (most regex-based rules).
 * Rules needing real AST parsing should use a proper parser.
 */
const stubParser = {
    parse: async () => ({ type: 'Program', start: 0, end: 0, children: [] }),
    walk: () => { },
    query: () => [],
};
