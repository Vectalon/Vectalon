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
import type { PlatformProfile, RuleSet, GuardrailSet } from './types';
/**
 * Registration metadata — provenance for a registered platform profile.
 */
export interface PlatformRegistration {
    profile: PlatformProfile;
    registeredAt: number;
    source: string;
}
/**
 * Resolved platform set — merged rules from multiple platforms.
 */
export interface ResolvedPlatforms {
    /** Individual platform profiles in order */
    platforms: PlatformProfile[];
    /** Rules from each platform, separated */
    platformRules: Map<string, RuleSet>;
    /** All platform rules merged, deduplicated by id */
    allRules: RuleSet;
}
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
export declare class PlatformProfileRegistry {
    private profiles;
    /**
     * Register a platform profile. Rejects duplicates by id.
     */
    register(profile: PlatformProfile, source?: string): void;
    /**
     * Register multiple profiles at once.
     */
    registerAll(profiles: PlatformProfile[], source?: string): void;
    /**
     * Replace an already-registered profile.
     */
    replace(profile: PlatformProfile, source?: string): void;
    /**
     * Get a platform profile by id.
     */
    get(id: string): PlatformProfile | undefined;
    /**
     * Get a platform profile by id. Throws if not found.
     */
    require(id: string): PlatformProfile;
    /**
     * Check if a platform is registered.
     */
    has(id: string): boolean;
    /**
     * Get registration metadata.
     */
    getRegistration(id: string): PlatformRegistration | undefined;
    /**
     * List all registered platform ids.
     */
    ids(): string[];
    /**
     * List all registered profiles.
     */
    list(): PlatformProfile[];
    /**
     * List all registrations with metadata.
     */
    listRegistrations(): PlatformRegistration[];
    get size(): number;
    /**
     * Resolve a set of platforms by their ids.
     * Returns individual profiles, per-platform rules, and merged rules.
     */
    resolveFor(ids: string[]): ResolvedPlatforms;
    /**
     * Build a complete GuardrailSet from multiple platforms.
     */
    resolveGuardrails(ids: string[]): GuardrailSet;
    /**
     * Resolve a platform by file extension.
     * E.g. resolveByExtension('.swift') → iOS profile.
     */
    resolveByExtension(ext: string): PlatformProfile | undefined;
    /**
     * Resolve a platform by file path.
     */
    resolveByFilePath(filePath: string): PlatformProfile | undefined;
    /**
     * Find which of the given platform ids handles this file.
     * Returns the first match, or undefined.
     */
    detectPlatform(filePath: string, platformIds: string[]): string | undefined;
    unregister(id: string): boolean;
    clear(): void;
}
/**
 * Global platform profile registry.
 * Import and use directly, or create separate instances for testing.
 */
export declare const platformProfiles: PlatformProfileRegistry;
