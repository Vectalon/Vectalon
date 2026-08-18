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
import type { FrameworkProfile, RuleSet, GuardrailSet } from './types';
import type { LanguageProfileRegistry } from './LanguageProfileRegistry';
/**
 * Registration metadata — provenance for a registered framework profile.
 */
export interface FrameworkRegistration {
    profile: FrameworkProfile;
    registeredAt: number;
    source: string;
}
/**
 * Resolved rule set — the complete merged rules for a framework,
 * including inherited language and parent framework rules.
 */
export interface ResolvedRules {
    /** Language rules (from the language this framework uses) */
    languageRules: RuleSet;
    /** Ancestor framework rules (from the inheritance chain) */
    ancestorRules: RuleSet;
    /** This framework's own rules */
    ownRules: RuleSet;
    /** All rules merged in order: language → ancestors → own */
    allRules: RuleSet;
}
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
export declare class FrameworkProfileRegistry {
    private profiles;
    private languageRegistry;
    constructor(languageRegistry?: LanguageProfileRegistry);
    /**
     * Register a framework profile. Rejects duplicates by id.
     */
    register(profile: FrameworkProfile, source?: string): void;
    /**
     * Register multiple profiles at once.
     */
    registerAll(profiles: FrameworkProfile[], source?: string): void;
    /**
     * Replace an already-registered profile (for hot-reloading or overrides).
     */
    replace(profile: FrameworkProfile, source?: string): void;
    /**
     * Get a framework profile by id. Returns undefined if not found.
     */
    get(id: string): FrameworkProfile | undefined;
    /**
     * Get a framework profile by id. Throws if not found.
     */
    require(id: string): FrameworkProfile;
    /**
     * Check if a framework is registered.
     */
    has(id: string): boolean;
    /**
     * Get registration metadata.
     */
    getRegistration(id: string): FrameworkRegistration | undefined;
    /**
     * List all registered framework ids.
     */
    ids(): string[];
    /**
     * List all registered profiles.
     */
    list(): FrameworkProfile[];
    /**
     * List all registrations with metadata.
     */
    listRegistrations(): FrameworkRegistration[];
    get size(): number;
    /**
     * Walk the inheritance chain from a framework to its root ancestor.
     * Returns [root, ..., grandparent, parent, self].
     *
     * Detects circular inheritance (throws).
     */
    inheritanceChain(id: string): FrameworkProfile[];
    /**
     * Resolve the full rule set for a framework, merging:
     *   1. Language rules (from the language this framework uses)
     *   2. Ancestor framework rules (from the inheritance chain)
     *   3. This framework's own rules
     *
     * Deduplicates by rule id — later rules win (own > ancestors > language).
     */
    resolveRules(id: string): ResolvedRules;
    /**
     * Build a complete GuardrailSet for a framework, merging inherited rules.
     */
    resolveGuardrails(id: string): GuardrailSet;
    unregister(id: string): boolean;
    clear(): void;
}
export declare const frameworkProfiles: FrameworkProfileRegistry;
