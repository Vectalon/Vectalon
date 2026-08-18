"use strict";
/**
 * FrameworkProfileRegistry — Plugin-based framework profile registry
 * Business Source License 1.1 (BSL-1.1)
 *
 * Frameworks are registered as plugins. Each framework may:
 * - Inherit from a parent framework (via `inherits`)
 * - Use a language (via `language`)
 *
 * When resolving the full rule set for a framework, the registry
 * walks the inheritance chain and merges rules without duplication.
 *
 * React Native example:
 *   react-native → extends react → uses typescript
 *   Full rule chain: [typescript rules] + [react rules] + [react-native rules]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.frameworkProfiles = exports.FrameworkProfileRegistry = void 0;
/**
 * FrameworkProfileRegistry — stores and resolves framework profiles.
 *
 * Supports:
 * - Registration with validation
 * - Lookup by id
 * - Inheritance chain resolution (walks `inherits` links)
 * - Full rule merging (language + ancestors + own rules, deduplicated)
 *
 * Design:
 * - Instance-based for testability.
 * - A global default instance is exported for convenience.
 * - Optionally accepts a LanguageProfileRegistry to resolve language rules.
 */
class FrameworkProfileRegistry {
    profiles = new Map();
    languageRegistry;
    constructor(languageRegistry) {
        this.languageRegistry = languageRegistry;
    }
    // ─── Registration ─────────────────────────────────────────────────────
    /**
     * Register a framework profile. Rejects duplicates by id.
     */
    register(profile, source = 'core') {
        if (!profile.id || typeof profile.id !== 'string') {
            throw new Error('FrameworkProfile must have a string id');
        }
        if (!profile.name || typeof profile.name !== 'string') {
            throw new Error(`FrameworkProfile "${profile.id}" must have a string name`);
        }
        if (this.profiles.has(profile.id)) {
            throw new Error(`FrameworkProfile "${profile.id}" is already registered`);
        }
        // Validate inheritance target exists if specified
        if (profile.inherits && !this.profiles.has(profile.inherits)) {
            throw new Error(`FrameworkProfile "${profile.id}" inherits from "${profile.inherits}", ` +
                `which is not yet registered. Register parent frameworks first.`);
        }
        this.profiles.set(profile.id, {
            profile,
            registeredAt: Date.now(),
            source,
        });
    }
    /**
     * Register multiple profiles at once.
     */
    registerAll(profiles, source = 'core') {
        for (const profile of profiles) {
            this.register(profile, source);
        }
    }
    /**
     * Replace an already-registered profile (for hot-reloading or overrides).
     */
    replace(profile, source = 'core') {
        if (!profile.id || !profile.name) {
            throw new Error('FrameworkProfile must have id and name');
        }
        this.profiles.set(profile.id, {
            profile,
            registeredAt: Date.now(),
            source,
        });
    }
    // ─── Lookup ───────────────────────────────────────────────────────────
    /**
     * Get a framework profile by id. Returns undefined if not found.
     */
    get(id) {
        return this.profiles.get(id)?.profile;
    }
    /**
     * Get a framework profile by id. Throws if not found.
     */
    require(id) {
        const profile = this.get(id);
        if (!profile) {
            throw new Error(`FrameworkProfile "${id}" not registered. Available: ${this.ids().join(', ')}`);
        }
        return profile;
    }
    /**
     * Check if a framework is registered.
     */
    has(id) {
        return this.profiles.has(id);
    }
    /**
     * Get registration metadata.
     */
    getRegistration(id) {
        return this.profiles.get(id);
    }
    /**
     * List all registered framework ids.
     */
    ids() {
        return Array.from(this.profiles.keys());
    }
    /**
     * List all registered profiles.
     */
    list() {
        return Array.from(this.profiles.values()).map(r => r.profile);
    }
    /**
     * List all registrations with metadata.
     */
    listRegistrations() {
        return Array.from(this.profiles.values());
    }
    get size() {
        return this.profiles.size;
    }
    // ─── Inheritance chain ────────────────────────────────────────────────
    /**
     * Walk the inheritance chain from a framework to its root ancestor.
     * Returns [root, ..., grandparent, parent, self].
     *
     * Detects circular inheritance (throws).
     */
    inheritanceChain(id) {
        const chain = [];
        const visited = new Set();
        let current = this.require(id);
        while (current) {
            if (visited.has(current.id)) {
                throw new Error(`Circular inheritance detected: "${current.id}" appears twice in the chain`);
            }
            visited.add(current.id);
            chain.unshift(current); // prepend — builds root-first order
            current = current.inherits ? this.get(current.inherits) : undefined;
        }
        return chain;
    }
    // ─── Rule resolution ──────────────────────────────────────────────────
    /**
     * Resolve the full rule set for a framework, merging:
     *   1. Language rules (from the language this framework uses)
     *   2. Ancestor framework rules (from the inheritance chain)
     *   3. This framework's own rules
     *
     * Deduplicates by rule id — later rules win (own > ancestors > language).
     */
    resolveRules(id) {
        const chain = this.inheritanceChain(id);
        const self = chain[chain.length - 1];
        // 1. Language rules
        let languageRules = [];
        if (self.language && this.languageRegistry) {
            const lang = this.languageRegistry.get(self.language);
            if (lang) {
                // Convert language string rule ids into minimal EngineeringRules
                // so they can be merged with framework EngineeringRules.
                // Language rules act as categories; framework rules are executable.
                languageRules = (lang.rules ?? []).map(ruleId => ({
                    id: ruleId,
                    version: '1.0.0',
                    name: ruleId,
                    description: `Language rule: ${ruleId}`,
                    severity: 'warning',
                    category: 'correctness',
                    appliesTo: lang.fileExtensions?.map(ext => `*${ext}`) ?? ['*'],
                    check: () => [],
                }));
            }
        }
        // 2. Ancestor rules (all frameworks except self)
        const ancestorRules = [];
        for (const ancestor of chain.slice(0, -1)) {
            ancestorRules.push(...(ancestor.rules ?? []));
        }
        // 3. Own rules
        const ownRules = self.rules ?? [];
        // Merge: deduplicate by id, later wins
        const allRules = mergeRuleSets(mergeRuleSets(languageRules, ancestorRules), ownRules);
        return { languageRules, ancestorRules, ownRules, allRules };
    }
    /**
     * Build a complete GuardrailSet for a framework, merging inherited rules.
     */
    resolveGuardrails(id) {
        const resolved = this.resolveRules(id);
        return {
            rules: resolved.allRules,
            onViolation: 'warn',
        };
    }
    // ─── Lifecycle ────────────────────────────────────────────────────────
    unregister(id) {
        return this.profiles.delete(id);
    }
    clear() {
        this.profiles.clear();
    }
}
exports.FrameworkProfileRegistry = FrameworkProfileRegistry;
// ─── Helpers ─────────────────────────────────────────────────────────────
function mergeRuleSets(base, override) {
    const overrideIds = new Set(override.map(r => r.id));
    const baseFiltered = base.filter(r => !overrideIds.has(r.id));
    return [...baseFiltered, ...override];
}
// ─── Global default instance ─────────────────────────────────────────────
/**
 * Global framework profile registry.
 * Import and use directly, or create separate instances for testing.
 */
const LanguageProfileRegistry_1 = require("./LanguageProfileRegistry");
exports.frameworkProfiles = new FrameworkProfileRegistry(LanguageProfileRegistry_1.languageProfiles);
