"use strict";
/**
 * PlatformProfileRegistry — Plugin-based platform profile registry
 * Business Source License 1.1 (BSL-1.1)
 *
 * Platforms are registered as plugins. A product like React Native
 * spans multiple platforms (iOS + Android). The registry supports:
 *
 * - Single-platform lookup (get iOS for an Objective-C file)
 * - Multi-platform resolution (merge iOS + Android rules for RN)
 * - File-based detection (which platform handles this file?)
 *
 * Usage:
 *   registry.register(iosDefinition, 'rn')
 *   registry.register(androidDefinition, 'rn')
 *   const merged = registry.resolveFor(['ios', 'android'])
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformProfiles = exports.PlatformProfileRegistry = void 0;
/**
 * PlatformProfileRegistry — stores and resolves platform profiles.
 *
 * Unlike framework profiles, platforms do NOT inherit from each other.
 * iOS and Android are peers. Multi-platform products compose them.
 *
 * Design:
 * - Instance-based for testability.
 * - A global default instance is exported for convenience.
 */
class PlatformProfileRegistry {
    profiles = new Map();
    // ─── Registration ─────────────────────────────────────────────────────
    /**
     * Register a platform profile. Rejects duplicates by id.
     */
    register(profile, source = 'core') {
        if (!profile.id || typeof profile.id !== 'string') {
            throw new Error('PlatformProfile must have a string id');
        }
        if (!profile.name || typeof profile.name !== 'string') {
            throw new Error(`PlatformProfile "${profile.id}" must have a string name`);
        }
        if (this.profiles.has(profile.id)) {
            throw new Error(`PlatformProfile "${profile.id}" is already registered`);
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
     * Replace an already-registered profile.
     */
    replace(profile, source = 'core') {
        if (!profile.id || !profile.name) {
            throw new Error('PlatformProfile must have id and name');
        }
        this.profiles.set(profile.id, {
            profile,
            registeredAt: Date.now(),
            source,
        });
    }
    // ─── Lookup ───────────────────────────────────────────────────────────
    /**
     * Get a platform profile by id.
     */
    get(id) {
        return this.profiles.get(id)?.profile;
    }
    /**
     * Get a platform profile by id. Throws if not found.
     */
    require(id) {
        const profile = this.get(id);
        if (!profile) {
            throw new Error(`PlatformProfile "${id}" not registered. Available: ${this.ids().join(', ')}`);
        }
        return profile;
    }
    /**
     * Check if a platform is registered.
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
     * List all registered platform ids.
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
    // ─── Multi-platform resolution ────────────────────────────────────────
    /**
     * Resolve a set of platforms by their ids.
     * Returns individual profiles, per-platform rules, and merged rules.
     */
    resolveFor(ids) {
        const platforms = [];
        const platformRules = new Map();
        for (const id of ids) {
            const profile = this.require(id);
            platforms.push(profile);
            if (profile.rules?.length) {
                platformRules.set(id, profile.rules);
            }
        }
        // Merge all platform rules, deduplicated by id (later platforms win)
        let allRules = [];
        for (const rules of platformRules.values()) {
            allRules = mergeRuleSets(allRules, rules);
        }
        return { platforms, platformRules, allRules };
    }
    /**
     * Build a complete GuardrailSet from multiple platforms.
     */
    resolveGuardrails(ids) {
        const resolved = this.resolveFor(ids);
        return {
            rules: resolved.allRules,
            onViolation: 'warn',
        };
    }
    // ─── File detection ───────────────────────────────────────────────────
    /**
     * Resolve a platform by file extension.
     * E.g. resolveByExtension('.swift') → iOS profile.
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
     * Resolve a platform by file path.
     */
    resolveByFilePath(filePath) {
        const dotIndex = filePath.lastIndexOf('.');
        if (dotIndex === -1)
            return undefined;
        const ext = filePath.slice(dotIndex);
        return this.resolveByExtension(ext);
    }
    /**
     * Find which of the given platform ids handles this file.
     * Returns the first match, or undefined.
     */
    detectPlatform(filePath, platformIds) {
        const dotIndex = filePath.lastIndexOf('.');
        if (dotIndex === -1)
            return undefined;
        const ext = filePath.slice(dotIndex);
        for (const id of platformIds) {
            const profile = this.get(id);
            if (profile?.fileExtensions?.includes(ext)) {
                return id;
            }
        }
        return undefined;
    }
    // ─── Lifecycle ────────────────────────────────────────────────────────
    unregister(id) {
        return this.profiles.delete(id);
    }
    clear() {
        this.profiles.clear();
    }
}
exports.PlatformProfileRegistry = PlatformProfileRegistry;
// ─── Helpers ─────────────────────────────────────────────────────────────
function mergeRuleSets(base, override) {
    const overrideIds = new Set(override.map(r => r.id));
    const baseFiltered = base.filter(r => !overrideIds.has(r.id));
    return [...baseFiltered, ...override];
}
// ─── Global default instance ─────────────────────────────────────────────
/**
 * Global platform profile registry.
 * Import and use directly, or create separate instances for testing.
 */
exports.platformProfiles = new PlatformProfileRegistry();
