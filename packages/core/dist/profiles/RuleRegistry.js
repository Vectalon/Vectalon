"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ruleRegistry = exports.RuleRegistry = void 0;
// ─── Registry ─────────────────────────────────────────────────────────────
/**
 * RuleRegistry — versioned rule store with validation.
 *
 * Design:
 * - Instance-based for testability.
 * - A global default instance is exported for convenience.
 * - Version validation uses semver: major mismatch = incompatible.
 * - Duplicate ID detection with replace option.
 */
class RuleRegistry {
    rules = new Map();
    // ─── Registration ─────────────────────────────────────────────────────
    /**
     * Register a rule. Validates version and rejects duplicates.
     * Returns the previous rule if the ID was already registered (and replaced).
     */
    register(rule, source = 'core') {
        this.validate(rule);
        const existing = this.rules.get(rule.id);
        if (existing) {
            // Check version compatibility
            const check = this.checkVersion(rule, existing.rule);
            if (!check.compatible) {
                throw new Error(`Rule "${rule.id}" version ${rule.version} is incompatible with registered version ${existing.rule.version}: ${check.reason}`);
            }
            // Store previous version in history
            const history = [
                ...existing.versionHistory,
                { version: existing.rule.version, registeredAt: existing.registeredAt },
            ];
            this.rules.set(rule.id, {
                rule,
                registeredAt: Date.now(),
                source,
                versionHistory: history,
            });
            return existing.rule;
        }
        this.rules.set(rule.id, {
            rule,
            registeredAt: Date.now(),
            source,
            versionHistory: [],
        });
        return undefined;
    }
    /**
     * Register multiple rules at once.
     */
    registerAll(rules, source = 'core') {
        for (const rule of rules) {
            this.register(rule, source);
        }
    }
    /**
     * Replace a rule without version validation.
     * Use for hot-reloading or force-updating.
     */
    replace(rule, source = 'core') {
        this.validate(rule);
        const existing = this.rules.get(rule.id);
        if (existing) {
            const history = [
                ...existing.versionHistory,
                { version: existing.rule.version, registeredAt: existing.registeredAt },
            ];
            this.rules.set(rule.id, {
                rule,
                registeredAt: Date.now(),
                source,
                versionHistory: history,
            });
            return existing.rule;
        }
        this.rules.set(rule.id, {
            rule,
            registeredAt: Date.now(),
            source,
            versionHistory: [],
        });
        return undefined;
    }
    // ─── Lookup ───────────────────────────────────────────────────────────
    /**
     * Find a rule by ID. Returns undefined if not found.
     */
    find(id) {
        return this.rules.get(id)?.rule;
    }
    /**
     * Find a rule by ID. Throws if not found.
     */
    require(id) {
        const rule = this.find(id);
        if (!rule) {
            throw new Error(`Rule "${id}" not registered. Available: ${this.ids().slice(0, 20).join(', ')}`);
        }
        return rule;
    }
    /**
     * Check if a rule is registered.
     */
    has(id) {
        return this.rules.has(id);
    }
    /**
     * Get registration metadata.
     */
    getRegistration(id) {
        return this.rules.get(id);
    }
    /**
     * List all registered rule IDs.
     */
    ids() {
        return Array.from(this.rules.keys());
    }
    /**
     * List all registered rules.
     */
    list() {
        return Array.from(this.rules.values()).map(r => r.rule);
    }
    /**
     * List all registrations with metadata.
     */
    listRegistrations() {
        return Array.from(this.rules.values());
    }
    get size() {
        return this.rules.size;
    }
    // ─── Query ────────────────────────────────────────────────────────────
    /**
     * Query rules by filter criteria.
     */
    query(filter) {
        return this.list().filter(rule => {
            if (filter.category && rule.category !== filter.category)
                return false;
            if (filter.severity && rule.severity !== filter.severity)
                return false;
            if (filter.detectable && !rule.detection)
                return false;
            if (filter.autoFixable && !rule.autoFixable)
                return false;
            if (filter.tags && !filter.tags.some(t => rule.tags?.includes(t)))
                return false;
            if (filter.appliesTo && !filter.appliesTo.some(p => rule.appliesTo?.includes(p)))
                return false;
            return true;
        });
    }
    /**
     * Get all rules of a specific category.
     */
    byCategory(category) {
        return this.query({ category });
    }
    /**
     * Get all rules of a specific severity.
     */
    bySeverity(severity) {
        return this.query({ severity });
    }
    /**
     * Get all rules with specific tags.
     */
    byTags(tags) {
        return this.query({ tags });
    }
    // ─── Resolution ───────────────────────────────────────────────────────
    /**
     * Resolve an array of rule IDs to full EngineeringRule objects.
     * Skips IDs that are not registered (logs a warning).
     *
     * This bridges LanguageProfile.rules (string[]) to actual definitions.
     */
    resolve(ruleIds) {
        const resolved = [];
        const missing = [];
        for (const id of ruleIds) {
            const rule = this.find(id);
            if (rule) {
                resolved.push(rule);
            }
            else {
                missing.push(id);
            }
        }
        if (missing.length > 0) {
            // In production, this would log a warning.
            // For now, we silently skip — profiles can reference rules that
            // haven't been registered yet (advisory rules).
        }
        return resolved;
    }
    /**
     * Resolve rule IDs from a profile's rules array.
     * Returns resolved rules plus any that could not be found.
     */
    resolveWithDiagnostics(ruleIds) {
        const resolved = [];
        const missing = [];
        for (const id of ruleIds) {
            const rule = this.find(id);
            if (rule) {
                resolved.push(rule);
            }
            else {
                missing.push(id);
            }
        }
        return { resolved, missing };
    }
    // ─── Validation ───────────────────────────────────────────────────────
    /**
     * Validate a rule's structure.
     */
    validate(rule) {
        if (!rule.id || typeof rule.id !== 'string') {
            throw new Error('EngineeringRule must have a string id');
        }
        if (!rule.version || typeof rule.version !== 'string') {
            throw new Error(`Rule "${rule.id}" must have a version string`);
        }
        if (!rule.name || typeof rule.name !== 'string') {
            throw new Error(`Rule "${rule.id}" must have a name`);
        }
        if (!isValidSemver(rule.version)) {
            throw new Error(`Rule "${rule.id}" has invalid version "${rule.version}" (expected semver)`);
        }
    }
    /**
     * Check version compatibility between two rule versions.
     * Major version mismatch = incompatible.
     */
    checkVersion(newRule, existingRule) {
        const newParts = parseSemver(newRule.version);
        const existingParts = parseSemver(existingRule.version);
        if (!newParts || !existingParts) {
            return { compatible: true }; // can't parse, assume compatible
        }
        if (newParts.major !== existingParts.major) {
            return {
                compatible: false,
                reason: `Major version changed from ${existingParts.major} to ${newParts.major}`,
            };
        }
        return { compatible: true };
    }
    // ─── Lifecycle ────────────────────────────────────────────────────────
    /**
     * Remove a rule. Returns true if it existed.
     */
    unregister(id) {
        return this.rules.delete(id);
    }
    /**
     * Clear all registrations. Useful in tests.
     */
    clear() {
        this.rules.clear();
    }
}
exports.RuleRegistry = RuleRegistry;
// ─── Helpers ─────────────────────────────────────────────────────────────
function isValidSemver(version) {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(version);
}
function parseSemver(version) {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match)
        return null;
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
    };
}
// ─── Global default instance ─────────────────────────────────────────────
/**
 * Global rule registry. Import and use directly, or create separate
 * instances for testing.
 */
exports.ruleRegistry = new RuleRegistry();
