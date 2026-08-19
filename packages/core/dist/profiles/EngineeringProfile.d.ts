/**
 * EngineeringProfile — Central composable specialization abstraction
 * Business Source License 1.1 (BSL-1.1)
 *
 * Provides validation, serialization, and composability for
 * engineering profiles. Profiles compose language, framework,
 * platform, project, and organization layers with rules and tools.
 */
import type { EngineeringProfile as IEngineeringProfile, LanguageProfile, FrameworkProfile, PlatformProfile, ProjectProfile, OrganizationProfile, ProfileMetadata, ValidationResult } from './types';
/** Backward-compatible alias — accepts a single platform and wraps it */
interface PlatformCompat {
    platform?: PlatformProfile;
}
/** Current schema version — bump for breaking changes to serialized format */
export declare const CURRENT_SCHEMA_VERSION = 1;
/**
 * EngineeringProfile — the composable specialization abstraction.
 *
 * Factory methods, validation, serialization, and composition are
 * static so profiles remain plain-data objects at runtime.
 */
export declare class EngineeringProfile {
    /**
     * Create a minimal EngineeringProfile.
     * Only `id` and `language` are required; everything else is optional.
     */
    static create(id: string, language: LanguageProfile, options?: Partial<Omit<IEngineeringProfile, 'id' | 'language' | 'schemaVersion'>> & PlatformCompat): IEngineeringProfile;
    /**
     * Validate an EngineeringProfile. Returns all errors and warnings.
     */
    static validate(profile: IEngineeringProfile): ValidationResult;
    /**
     * Serialize an EngineeringProfile to a JSON-safe object.
     * Strips functions (from GuardrailRule.check) — those cannot be serialized.
     */
    static toJSON(profile: IEngineeringProfile): IEngineeringProfileJSON;
    /**
     * Deserialize a JSON object back into an EngineeringProfile.
     * Note: GuardrailRule.check functions must be re-attached after deserialization.
     */
    static fromJSON(json: IEngineeringProfileJSON): IEngineeringProfile;
    /**
     * Serialize to a JSON string, ready for storage or transport.
     */
    static serialize(profile: IEngineeringProfile): string;
    /**
     * Deserialize from a JSON string.
     */
    static deserialize(jsonString: string): IEngineeringProfile;
    /**
     * Merge two profiles into a new composite profile.
     *
     * Precedence: `override` wins over `base` for scalar/optional fields.
     * Arrays (rules, tools) are concatenated. Duplicate rule/tool ids from
     * `override` replace the corresponding entries from `base`.
     */
    static merge(base: IEngineeringProfile, override: Partial<IEngineeringProfile> & PlatformCompat): IEngineeringProfile;
    /**
     * Compose a profile from a stack of partial overrides.
     * Later entries win. The first entry must supply `id` and `language`.
     */
    static compose(...layers: (Partial<IEngineeringProfile> & PlatformCompat)[]): IEngineeringProfile;
}
/**
 * JSON-safe version of EngineeringProfile (no functions).
 */
export interface IEngineeringProfileJSON {
    id: string;
    version: string;
    schemaVersion: number;
    language: LanguageProfile;
    framework?: FrameworkProfile;
    platforms?: PlatformProfile[];
    project?: ProjectProfile;
    organization?: OrganizationProfile;
    rules: Array<{
        id: string;
        version: string;
        name: string;
        category: string;
        description: string;
        severity: string;
        appliesTo?: string[];
    }>;
    guardrails: {
        rules: Array<{
            id: string;
            version: string;
            name: string;
            category: string;
            description: string;
            severity: string;
            appliesTo?: string[];
        }>;
        onViolation?: string;
        config?: Record<string, unknown>;
    };
    tools: Array<{
        id: string;
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        dangerous?: boolean;
    }>;
    metadata?: ProfileMetadata;
}
export {};
