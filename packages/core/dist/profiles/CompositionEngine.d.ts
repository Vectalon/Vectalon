/**
 * CompositionEngine — Deterministic profile composition with conflict resolution
 * Business Source License 1.1 (BSL-1.1)
 *
 * This is the core composition engine. It takes heterogeneous profile
 * inputs (language, framework, platform, project, organization) and
 * produces a single effective EngineeringProfile with deterministic
 * conflict resolution.
 *
 * ## Precedence model
 *
 * When the same rule id exists at multiple layers, the layer with
 * higher precedence wins. Default precedence (lowest → highest):
 *
 *   language → framework → platform → project → organization → system
 *
 * This means:
 *   - Organization policies override framework defaults
 *   - Project-specific rules override platform defaults
 *   - System rules (the harness itself) override everything
 *
 * Precedence is configurable via `PrecedenceMap`.
 *
 * ## Usage
 *
 * ```ts
 * const engine = new CompositionEngine()
 * const result = engine.compose([
 *   { layer: 'language', source: typescriptProfile },
 *   { layer: 'framework', source: reactNativeProfile },
 *   { layer: 'platform', source: iosProfile },
 *   { layer: 'platform', source: androidProfile },
 *   { layer: 'organization', source: companyProfile },
 * ])
 * // result.profile  — effective EngineeringProfile
 * // result.conflicts — what was overridden and by whom
 * ```
 */
import type { LanguageProfile, FrameworkProfile, PlatformProfile, ProjectProfile, OrganizationProfile, EngineeringProfile as IEngineeringProfile } from './types';
import type { EngineeringRule } from './EngineeringRule';
/**
 * Composition layer — the six specialization layers in order of increasing
 * precedence. System is the harness itself (e.g., Vectalon RN product).
 */
export type CompositionLayer = 'language' | 'framework' | 'platform' | 'project' | 'organization' | 'system';
/**
 * The six layers ordered from lowest to highest precedence.
 * This is the authoritative ordering used throughout the engine.
 */
export declare const LAYER_ORDER: CompositionLayer[];
/**
 * Precedence map — maps each layer to a numeric precedence value.
 * Higher value = higher precedence = wins in conflicts.
 */
export type PrecedenceMap = Record<CompositionLayer, number>;
/**
 * Default precedence: language(0) < framework(1) < platform(2) < project(3)
 * < organization(4) < system(5).
 *
 * This encodes the principle that organization policy overrides framework
 * defaults, project overrides platform, and system overrides everything.
 */
export declare const DEFAULT_PRECEDENCE: PrecedenceMap;
/**
 * A single composition input — a profile classified into a layer.
 */
export type CompositionInput = {
    layer: 'language';
    source: LanguageProfile;
} | {
    layer: 'framework';
    source: FrameworkProfile;
} | {
    layer: 'platform';
    source: PlatformProfile;
} | {
    layer: 'project';
    source: ProjectProfile;
} | {
    layer: 'organization';
    source: OrganizationProfile;
} | {
    layer: 'system';
    source: Partial<IEngineeringProfile>;
};
/**
 * A conflict record — documents when a higher-precedence layer
 * overrides a lower-precedence rule.
 */
export interface CompositionConflict {
    ruleId: string;
    overriddenBy: CompositionLayer;
    overriddenFrom: CompositionLayer;
    /** The winning rule (from the higher-precedence layer) */
    winningRule: EngineeringRule;
    /** The losing rule (from the lower-precedence layer) */
    losingRule: EngineeringRule;
}
/**
 * Diagnostic record — tracks which layer contributed each rule.
 */
export interface RuleProvenance {
    ruleId: string;
    layer: CompositionLayer;
    sourceId: string;
}
/**
 * Composition options — configuration for the composition engine.
 */
export interface CompositionOptions {
    /** Custom precedence map. Defaults to DEFAULT_PRECEDENCE. */
    precedence?: PrecedenceMap;
    /** Profile id for the resulting EngineeringProfile. Defaults to 'composed'. */
    id?: string;
    /** Version for the resulting profile. Defaults to '1.0.0'. */
    version?: string;
}
/**
 * Composition result — the effective profile plus diagnostics.
 */
export interface CompositionResult {
    /** The composed EngineeringProfile */
    profile: IEngineeringProfile;
    /** Conflicts that were resolved (higher layer won) */
    conflicts: CompositionConflict[];
    /** Provenance: which layer provided each rule */
    provenance: RuleProvenance[];
    /** Precedence map used for this composition */
    precedence: PrecedenceMap;
}
/**
 * CompositionEngine — deterministic profile composition.
 *
 * Design:
 * - Stateless — each compose() call is independent.
 * - Deterministic — same inputs always produce the same output.
 * - Configurable precedence via PrecedenceMap.
 * - Full diagnostics (conflicts + provenance) for transparency.
 */
export declare class CompositionEngine {
    private precedence;
    constructor(precedence?: PrecedenceMap);
    /**
     * Compose heterogeneous profile inputs into a single effective profile.
     *
     * Rules:
     * 1. Rules are classified by their input layer.
     * 2. When the same rule id exists at multiple layers, the one with
     *    higher precedence wins.
     * 3. Non-conflicting rules from all layers are included.
     * 4. Tools and config are merged similarly (higher precedence wins).
     * 5. Scalar fields (language, framework, etc.) use highest-precedence value.
     */
    compose(inputs: CompositionInput[], options?: CompositionOptions): CompositionResult;
}
/**
 * Convenience function — compose profiles with default precedence.
 *
 * Accepts any mix of profile types and classifies them automatically.
 *
 * ```ts
 * const result = composeProfiles([
 *   typescriptProfile,    // → auto-detected as language
 *   reactNativeProfile,   // → auto-detected as framework
 *   iosProfile,           // → auto-detected as platform
 *   companyProfile,       // → auto-detected as organization
 * ])
 * ```
 */
export declare function composeProfiles(inputs: Array<LanguageProfile | FrameworkProfile | PlatformProfile | ProjectProfile | OrganizationProfile>, options?: CompositionOptions): CompositionResult;
