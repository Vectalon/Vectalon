"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.languageProfiles = exports.LanguageProfileRegistry = void 0;
/**
 * LanguageProfileRegistry — stores and resolves language profiles.
 *
 * Design:
 * - Instance-based for testability (no hidden singletons in Core).
 * - An optional global default instance is exported for convenience.
 * - Registration validates the profile; duplicates are rejected.
 * - Lookup by id, file extension, or name.
 */
class LanguageProfileRegistry {
    profiles = new Map();
    // ─── Registration ─────────────────────────────────────────────────────
    /**
     * Register a language profile. Rejects duplicates by id.
     * Throws if the profile is missing required fields.
     */
    register(profile, source = 'core') {
        if (!profile.id || typeof profile.id !== 'string') {
            throw new Error('LanguageProfile must have a string id');
        }
        if (!profile.name || typeof profile.name !== 'string') {
            throw new Error(`LanguageProfile "${profile.id}" must have a string name`);
        }
        if (!profile.features) {
            throw new Error(`LanguageProfile "${profile.id}" must have features`);
        }
        if (this.profiles.has(profile.id)) {
            throw new Error(`LanguageProfile "${profile.id}" is already registered`);
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
        if (!profile.id || !profile.name || !profile.features) {
            throw new Error('LanguageProfile must have id, name, and features');
        }
        this.profiles.set(profile.id, {
            profile,
            registeredAt: Date.now(),
            source,
        });
    }
    // ─── Lookup ───────────────────────────────────────────────────────────
    /**
     * Get a language profile by id. Returns undefined if not found.
     */
    get(id) {
        return this.profiles.get(id)?.profile;
    }
    /**
     * Get a language profile by id. Throws if not found.
     */
    require(id) {
        const profile = this.get(id);
        if (!profile) {
            throw new Error(`LanguageProfile "${id}" not registered. Available: ${this.ids().join(', ')}`);
        }
        return profile;
    }
    /**
     * Check if a language is registered.
     */
    has(id) {
        return this.profiles.has(id);
    }
    /**
     * Get registration metadata (including source and timestamp).
     */
    getRegistration(id) {
        return this.profiles.get(id);
    }
    /**
     * List all registered language ids.
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
    // ─── Detection ────────────────────────────────────────────────────────
    /**
     * Resolve a language by file extension.
     * E.g. resolveByExtension('.ts') → typescript profile.
     */
    resolveByExtension(ext) {
        const normalised = ext.startsWith('.') ? ext : `.${ext}`;
        for (const reg of this.profiles.values()) {
            if (reg.profile.fileExtensions?.includes(normalised)) {
                return reg.profile;
            }
        }
        return undefined;
    }
    /**
     * Resolve a language by file path (uses the extension).
     */
    resolveByFilePath(filePath) {
        const dotIndex = filePath.lastIndexOf('.');
        if (dotIndex === -1)
            return undefined;
        const ext = filePath.slice(dotIndex);
        return this.resolveByExtension(ext);
    }
    // ─── Introspection ────────────────────────────────────────────────────
    /**
     * Get all rule ids across all registered languages.
     */
    allRuleIds() {
        const ids = new Set();
        for (const reg of this.profiles.values()) {
            for (const rule of reg.profile.rules ?? []) {
                ids.add(rule);
            }
        }
        return Array.from(ids);
    }
    /**
     * Get rule ids for a specific language.
     */
    ruleIdsFor(id) {
        return this.get(id)?.rules ?? [];
    }
    /**
     * Count of registered languages.
     */
    get size() {
        return this.profiles.size;
    }
    // ─── Lifecycle ────────────────────────────────────────────────────────
    /**
     * Remove a language registration. Returns true if it existed.
     */
    unregister(id) {
        return this.profiles.delete(id);
    }
    /**
     * Clear all registrations. Useful in tests.
     */
    clear() {
        this.profiles.clear();
    }
}
exports.LanguageProfileRegistry = LanguageProfileRegistry;
// ─── Global default instance ─────────────────────────────────────────────
/**
 * Global language profile registry. Products register their languages here.
 * Import and use directly, or create separate instances for testing.
 */
exports.languageProfiles = new LanguageProfileRegistry();
