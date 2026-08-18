/**
 * TypeScript — language profile definition
 * Business Source License 1.1 (BSL-1.1)
 *
 * This is a first-class language plugin. It can be registered into
 * any LanguageProfileRegistry:
 *
 *   registry.register(typescriptDefinition, 'rn')
 *
 * Additional languages (Swift, Kotlin, Python, Rust) follow the
 * same pattern — each is a standalone module exporting a LanguageProfile.
 */
import type { LanguageProfile } from '../types';
/**
 * TypeScript language profile.
 *
 * Covers the full surface area: features, rules (machine-readable),
 * anti-patterns, idioms, file extensions, and parser hint.
 */
export declare const typescriptDefinition: LanguageProfile;
