/**
 * RuleRegistry — Versioned rule store
 * Business Source License 1.1 (BSL-1.1)
 *
 * Central registry for EngineeringRules. Rules are registered by ID
 * and can be discovered, queried, and resolved through profiles.
 *
 * ## Features
 * - Register / unregister / replace rules
 * - Find by ID, query by category/severity/tags
 * - Version validation (semver — warns on major incompatibility)
 * - Duplicate ID detection
 * - Resolve string rule IDs to full EngineeringRule objects
 *   (bridges LanguageProfile.rules to actual definitions)
 *
 * ## Usage
 *
 * ```ts
 * const registry = new RuleRegistry()
 * registry.register(rnArchitectureRule)
 * registry.register(typescriptStrictRule)
 *
 * const rule = registry.find('RN-ARCH-001')
 * const resolved = registry.resolve(['RN-ARCH-001', 'TS-STRICT-001'])
 * ```
 */
import type { EngineeringRule, RuleSeverity, RuleCategory } from './EngineeringRule';
/**
 * Registration metadata — provenance and version history for a rule.
 */
export interface RuleRegistration {
    rule: EngineeringRule;
    registeredAt: number;
    source: string;
    /** Previous versions of this rule (if replaced) */
    versionHistory: Array<{
        version: string;
        registeredAt: number;
    }>;
}
/**
 * Filter for querying rules.
 */
export interface RuleFilter {
    category?: RuleCategory;
    severity?: RuleSeverity;
    tags?: string[];
    /** Only rules with detection strategies */
    detectable?: boolean;
    /** Only auto-fixable rules */
    autoFixable?: boolean;
    /** Only rules matching these file patterns */
    appliesTo?: string[];
}
/**
 * Version compatibility result.
 */
export interface VersionCheck {
    compatible: boolean;
    reason?: string;
}
/**
 * RuleRegistry — versioned rule store with validation.
 *
 * Design:
 * - Instance-based for testability.
 * - A global default instance is exported for convenience.
 * - Version validation uses semver: major mismatch = incompatible.
 * - Duplicate ID detection with replace option.
 */
export declare class RuleRegistry {
    private rules;
    /**
     * Register a rule. Validates version and rejects duplicates.
     * Returns the previous rule if the ID was already registered (and replaced).
     */
    register(rule: EngineeringRule, source?: string): EngineeringRule | undefined;
    /**
     * Register multiple rules at once.
     */
    registerAll(rules: EngineeringRule[], source?: string): void;
    /**
     * Replace a rule without version validation.
     * Use for hot-reloading or force-updating.
     */
    replace(rule: EngineeringRule, source?: string): EngineeringRule | undefined;
    /**
     * Find a rule by ID. Returns undefined if not found.
     */
    find(id: string): EngineeringRule | undefined;
    /**
     * Find a rule by ID. Throws if not found.
     */
    require(id: string): EngineeringRule;
    /**
     * Check if a rule is registered.
     */
    has(id: string): boolean;
    /**
     * Get registration metadata.
     */
    getRegistration(id: string): RuleRegistration | undefined;
    /**
     * List all registered rule IDs.
     */
    ids(): string[];
    /**
     * List all registered rules.
     */
    list(): EngineeringRule[];
    /**
     * List all registrations with metadata.
     */
    listRegistrations(): RuleRegistration[];
    get size(): number;
    /**
     * Query rules by filter criteria.
     */
    query(filter: RuleFilter): EngineeringRule[];
    /**
     * Get all rules of a specific category.
     */
    byCategory(category: RuleCategory): EngineeringRule[];
    /**
     * Get all rules of a specific severity.
     */
    bySeverity(severity: RuleSeverity): EngineeringRule[];
    /**
     * Get all rules with specific tags.
     */
    byTags(tags: string[]): EngineeringRule[];
    /**
     * Resolve an array of rule IDs to full EngineeringRule objects.
     * Skips IDs that are not registered (logs a warning).
     *
     * This bridges LanguageProfile.rules (string[]) to actual definitions.
     */
    resolve(ruleIds: string[]): EngineeringRule[];
    /**
     * Resolve rule IDs from a profile's rules array.
     * Returns resolved rules plus any that could not be found.
     */
    resolveWithDiagnostics(ruleIds: string[]): {
        resolved: EngineeringRule[];
        missing: string[];
    };
    /**
     * Validate a rule's structure.
     */
    validate(rule: EngineeringRule): void;
    /**
     * Check version compatibility between two rule versions.
     * Major version mismatch = incompatible.
     */
    checkVersion(newRule: EngineeringRule, existingRule: EngineeringRule): VersionCheck;
    /**
     * Remove a rule. Returns true if it existed.
     */
    unregister(id: string): boolean;
    /**
     * Clear all registrations. Useful in tests.
     */
    clear(): void;
}
/**
 * Global rule registry. Import and use directly, or create separate
 * instances for testing.
 */
export declare const ruleRegistry: RuleRegistry;
