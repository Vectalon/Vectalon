/**
 * LanguageProfileRegistry — Plugin-based language profile registry
 * Business Source License 1.1 (BSL-1.1)
 *
 * Languages are registered as plugins. Core never hard-codes
 * `if (language === "typescript")` — it resolves everything
 * through this registry.
 *
 * Usage:
 *   const registry = new LanguageProfileRegistry()
 *   registry.register(typescriptDefinition)
 *   const ts = registry.get('typescript')
 */
import type { LanguageProfile } from './types';
/**
 * Registration metadata — provenance for a registered language profile.
 */
export interface LanguageRegistration {
    profile: LanguageProfile;
    registeredAt: number;
    source: string;
}
/**
 * LanguageProfileRegistry — stores and resolves language profiles.
 *
 * Design:
 * - Instance-based for testability (no hidden singletons in Core).
 * - An optional global default instance is exported for convenience.
 * - Registration validates the profile; duplicates are rejected.
 * - Lookup by id, file extension, or name.
 */
export declare class LanguageProfileRegistry {
    private profiles;
    /**
     * Register a language profile. Rejects duplicates by id.
     * Throws if the profile is missing required fields.
     */
    register(profile: LanguageProfile, source?: string): void;
    /**
     * Register multiple profiles at once.
     */
    registerAll(profiles: LanguageProfile[], source?: string): void;
    /**
     * Replace an already-registered profile (for hot-reloading or overrides).
     */
    replace(profile: LanguageProfile, source?: string): void;
    /**
     * Get a language profile by id. Returns undefined if not found.
     */
    get(id: string): LanguageProfile | undefined;
    /**
     * Get a language profile by id. Throws if not found.
     */
    require(id: string): LanguageProfile;
    /**
     * Check if a language is registered.
     */
    has(id: string): boolean;
    /**
     * Get registration metadata (including source and timestamp).
     */
    getRegistration(id: string): LanguageRegistration | undefined;
    /**
     * List all registered language ids.
     */
    ids(): string[];
    /**
     * List all registered profiles.
     */
    list(): LanguageProfile[];
    /**
     * List all registrations with metadata.
     */
    listRegistrations(): LanguageRegistration[];
    /**
     * Resolve a language by file extension.
     * E.g. resolveByExtension('.ts') → typescript profile.
     */
    resolveByExtension(ext: string): LanguageProfile | undefined;
    /**
     * Resolve a language by file path (uses the extension).
     */
    resolveByFilePath(filePath: string): LanguageProfile | undefined;
    /**
     * Get all rule ids across all registered languages.
     */
    allRuleIds(): string[];
    /**
     * Get rule ids for a specific language.
     */
    ruleIdsFor(id: string): string[];
    /**
     * Count of registered languages.
     */
    get size(): number;
    /**
     * Remove a language registration. Returns true if it existed.
     */
    unregister(id: string): boolean;
    /**
     * Clear all registrations. Useful in tests.
     */
    clear(): void;
}
/**
 * Global language profile registry. Products register their languages here.
 * Import and use directly, or create separate instances for testing.
 */
export declare const languageProfiles: LanguageProfileRegistry;
