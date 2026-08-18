"use strict";
/**
 * EngineeringProfile — Central composable specialization abstraction
 * Business Source License 1.1 (BSL-1.1)
 *
 * Provides validation, serialization, and composability for
 * engineering profiles. Profiles compose language, framework,
 * platform, project, and organization layers with rules and tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineeringProfile = exports.CURRENT_SCHEMA_VERSION = void 0;
/** Current schema version — bump for breaking changes to serialized format */
exports.CURRENT_SCHEMA_VERSION = 1;
/**
 * EngineeringProfile — the composable specialization abstraction.
 *
 * Factory methods, validation, serialization, and composition are
 * static so profiles remain plain-data objects at runtime.
 */
class EngineeringProfile {
    // ─── Factory ───────────────────────────────────────────────────────────
    /**
     * Create a minimal EngineeringProfile.
     * Only `id` and `language` are required; everything else is optional.
     */
    static create(id, language, options = {}) {
        // Backward compatibility: accept `platform` and wrap in `platforms`
        const platforms = options.platforms ?? (options.platform ? [options.platform] : undefined);
        return {
            id,
            version: options.version ?? '1.0.0',
            schemaVersion: exports.CURRENT_SCHEMA_VERSION,
            language,
            framework: options.framework,
            platforms,
            project: options.project,
            organization: options.organization,
            rules: options.rules ?? [],
            guardrails: options.guardrails ?? { rules: [] },
            tools: options.tools ?? [],
            metadata: options.metadata,
        };
    }
    // ─── Validation ────────────────────────────────────────────────────────
    /**
     * Validate an EngineeringProfile. Returns all errors and warnings.
     */
    static validate(profile) {
        const errors = [];
        // Structural
        if (!profile.id || typeof profile.id !== 'string') {
            errors.push({ path: 'id', message: 'Profile id is required and must be a string', severity: 'error' });
        }
        if (!profile.version || typeof profile.version !== 'string') {
            errors.push({ path: 'version', message: 'Profile version is required and must be a string', severity: 'error' });
        }
        else if (!isValidSemver(profile.version)) {
            errors.push({
                path: 'version',
                message: `Profile version "${profile.version}" is not valid semver (expected MAJOR.MINOR.PATCH)`,
                severity: 'warning',
            });
        }
        if (typeof profile.schemaVersion !== 'number' || profile.schemaVersion < 1) {
            errors.push({
                path: 'schemaVersion',
                message: 'schemaVersion must be a positive integer',
                severity: 'error',
            });
        }
        // Language (required)
        if (!profile.language || typeof profile.language !== 'object') {
            errors.push({ path: 'language', message: 'LanguageProfile is required', severity: 'error' });
        }
        else {
            if (!profile.language.id) {
                errors.push({ path: 'language.id', message: 'LanguageProfile.id is required', severity: 'error' });
            }
            if (!profile.language.name) {
                errors.push({ path: 'language.name', message: 'LanguageProfile.name is required', severity: 'error' });
            }
            if (!profile.language.features) {
                errors.push({ path: 'language.features', message: 'LanguageProfile.features is required', severity: 'error' });
            }
        }
        // Rules — check for duplicate ids
        const ruleIds = new Set();
        for (const rule of profile.rules) {
            if (!rule.id) {
                errors.push({ path: 'rules', message: 'All rules must have an id', severity: 'error' });
            }
            else if (ruleIds.has(rule.id)) {
                errors.push({ path: `rules.${rule.id}`, message: `Duplicate rule id: "${rule.id}"`, severity: 'error' });
            }
            else {
                ruleIds.add(rule.id);
            }
        }
        // Guardrails rules — same uniqueness check
        if (profile.guardrails?.rules) {
            const guardrailIds = new Set();
            for (const rule of profile.guardrails.rules) {
                if (!rule.id) {
                    errors.push({ path: 'guardrails.rules', message: 'All guardrail rules must have an id', severity: 'error' });
                }
                else if (guardrailIds.has(rule.id)) {
                    errors.push({
                        path: `guardrails.rules.${rule.id}`,
                        message: `Duplicate guardrail rule id: "${rule.id}"`,
                        severity: 'error',
                    });
                }
                else {
                    guardrailIds.add(rule.id);
                }
            }
        }
        // Tools — check for duplicate ids
        const toolIds = new Set();
        for (const tool of profile.tools) {
            if (!tool.id) {
                errors.push({ path: 'tools', message: 'All tools must have an id', severity: 'error' });
            }
            else if (toolIds.has(tool.id)) {
                errors.push({ path: `tools.${tool.id}`, message: `Duplicate tool id: "${tool.id}"`, severity: 'error' });
            }
            else {
                toolIds.add(tool.id);
            }
        }
        return {
            valid: errors.filter(e => e.severity === 'error').length === 0,
            errors,
        };
    }
    // ─── Serialization ─────────────────────────────────────────────────────
    /**
     * Serialize an EngineeringProfile to a JSON-safe object.
     * Strips functions (from GuardrailRule.check) — those cannot be serialized.
     */
    static toJSON(profile) {
        return {
            id: profile.id,
            version: profile.version,
            schemaVersion: profile.schemaVersion,
            language: profile.language,
            framework: profile.framework,
            platforms: profile.platforms,
            project: profile.project,
            organization: profile.organization,
            rules: profile.rules.map(rule => ({
                id: rule.id,
                version: rule.version,
                name: rule.name,
                category: rule.category,
                description: rule.description,
                severity: rule.severity,
                appliesTo: rule.appliesTo,
                // check function is omitted — not serializable
            })),
            guardrails: {
                rules: (profile.guardrails?.rules ?? []).map(rule => ({
                    id: rule.id,
                    version: rule.version,
                    name: rule.name,
                    category: rule.category,
                    description: rule.description,
                    severity: rule.severity,
                    appliesTo: rule.appliesTo,
                })),
                onViolation: profile.guardrails?.onViolation,
                config: profile.guardrails?.config,
            },
            tools: profile.tools.map(tool => ({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                outputSchema: tool.outputSchema,
                dangerous: tool.dangerous,
            })),
            metadata: profile.metadata,
        };
    }
    /**
     * Deserialize a JSON object back into an EngineeringProfile.
     * Note: GuardrailRule.check functions must be re-attached after deserialization.
     */
    static fromJSON(json) {
        return {
            id: json.id,
            version: json.version,
            schemaVersion: json.schemaVersion,
            language: json.language,
            framework: json.framework,
            platforms: json.platforms,
            project: json.project,
            organization: json.organization,
            rules: json.rules.map(r => ({
                ...r,
                version: r.version ?? '1.0.0',
                category: r.category ?? 'correctness',
                check: () => [], // stub — must be replaced with real implementation
            })),
            guardrails: {
                rules: (json.guardrails?.rules ?? []).map(r => ({
                    ...r,
                    version: r.version ?? '1.0.0',
                    category: r.category ?? 'correctness',
                    check: () => [], // stub — must be replaced with real implementation
                })),
                onViolation: json.guardrails?.onViolation,
                config: json.guardrails?.config,
            },
            tools: json.tools,
            metadata: json.metadata,
        };
    }
    /**
     * Serialize to a JSON string, ready for storage or transport.
     */
    static serialize(profile) {
        return JSON.stringify(EngineeringProfile.toJSON(profile), null, 2);
    }
    /**
     * Deserialize from a JSON string.
     */
    static deserialize(jsonString) {
        const parsed = JSON.parse(jsonString);
        return EngineeringProfile.fromJSON(parsed);
    }
    // ─── Composability ─────────────────────────────────────────────────────
    /**
     * Merge two profiles into a new composite profile.
     *
     * Precedence: `override` wins over `base` for scalar/optional fields.
     * Arrays (rules, tools) are concatenated. Duplicate rule/tool ids from
     * `override` replace the corresponding entries from `base`.
     */
    static merge(base, override) {
        const mergedRules = mergeRuleSets(base.rules, override.rules ?? []);
        const mergedGuardrails = mergeGuardrailSets(base.guardrails, override.guardrails);
        const mergedTools = mergeToolSets(base.tools, override.tools ?? []);
        // Platforms: merge arrays, override wins for same-id platforms
        const overridePlatforms = override.platforms ?? (override.platform ? [override.platform] : undefined);
        const mergedPlatforms = overridePlatforms
            ? mergePlatformSets(base.platforms ?? [], overridePlatforms)
            : base.platforms;
        return {
            id: override.id ?? base.id,
            version: override.version ?? base.version,
            schemaVersion: override.schemaVersion ?? base.schemaVersion,
            language: override.language ?? base.language,
            framework: override.framework ?? base.framework,
            platforms: mergedPlatforms,
            project: override.project ?? base.project,
            organization: override.organization ?? base.organization,
            rules: mergedRules,
            guardrails: mergedGuardrails,
            tools: mergedTools,
            metadata: override.metadata ?? base.metadata,
        };
    }
    /**
     * Compose a profile from a stack of partial overrides.
     * Later entries win. The first entry must supply `id` and `language`.
     */
    static compose(...layers) {
        if (layers.length === 0) {
            throw new Error('EngineeringProfile.compose requires at least one layer');
        }
        const [first, ...rest] = layers;
        if (!first.id) {
            throw new Error('First layer must provide an id');
        }
        if (!first.language) {
            throw new Error('First layer must provide a language profile');
        }
        let result = EngineeringProfile.create(first.id, first.language, first);
        for (const layer of rest) {
            result = EngineeringProfile.merge(result, layer);
        }
        return result;
    }
    // ─── Schema validation
    // ─── Schema validation ──────────────────────────────────────────────────
    /**
     * Validate a serialized EngineeringProfile JSON object against the
     * canonical JSON Schema (engineering-profile.schema.json).
     *
     * Lightweight structural validator that checks shape and required fields.
     * For full JSON Schema validation, use a dedicated validator (ajv, etc.).
     */
    static validateSchema(json) {
        const errors = [];
        // Required top-level fields
        const requiredTopLevel = [
            'id', 'version', 'schemaVersion', 'language', 'rules', 'guardrails', 'tools',
        ];
        for (const field of requiredTopLevel) {
            if (json[field] === undefined || json[field] === null) {
                errors.push({ path: field, message: `Missing required field: ${field}`, severity: 'error' });
            }
        }
        // Validate language profile structure
        if (json.language) {
            if (!json.language.id || typeof json.language.id !== 'string') {
                errors.push({ path: 'language.id', message: 'LanguageProfile.id is required', severity: 'error' });
            }
            if (!json.language.name || typeof json.language.name !== 'string') {
                errors.push({ path: 'language.name', message: 'LanguageProfile.name is required', severity: 'error' });
            }
            if (!json.language.features) {
                errors.push({ path: 'language.features', message: 'LanguageProfile.features is required', severity: 'error' });
            }
            else {
                const validTyping = ['static', 'dynamic', 'gradual', 'inferred'];
                const validConcurrency = ['async-await', 'threads', 'actors', 'goroutines', 'event-loop', 'none'];
                const validErrorHandling = ['exceptions', 'result-type', 'error-codes', 'option-type', 'mixed'];
                const validModuleSystem = ['esm', 'commonjs', 'importmap', 'mixed'];
                if (!validTyping.includes(json.language.features.typing)) {
                    errors.push({ path: 'language.features.typing', message: `Invalid typing: ${json.language.features.typing}`, severity: 'error' });
                }
                if (!validConcurrency.includes(json.language.features.concurrency)) {
                    errors.push({ path: 'language.features.concurrency', message: `Invalid concurrency: ${json.language.features.concurrency}`, severity: 'error' });
                }
                if (!validErrorHandling.includes(json.language.features.errorHandling)) {
                    errors.push({ path: 'language.features.errorHandling', message: `Invalid errorHandling: ${json.language.features.errorHandling}`, severity: 'error' });
                }
                if (!validModuleSystem.includes(json.language.features.moduleSystem)) {
                    errors.push({ path: 'language.features.moduleSystem', message: `Invalid moduleSystem: ${json.language.features.moduleSystem}`, severity: 'error' });
                }
            }
        }
        // Validate schemaVersion
        if (typeof json.schemaVersion !== 'number' || json.schemaVersion < 1) {
            errors.push({ path: 'schemaVersion', message: 'schemaVersion must be a positive integer', severity: 'error' });
        }
        // Validate rules array
        if (!Array.isArray(json.rules)) {
            errors.push({ path: 'rules', message: 'rules must be an array', severity: 'error' });
        }
        else {
            for (let i = 0; i < json.rules.length; i++) {
                const rule = json.rules[i];
                if (!rule.id)
                    errors.push({ path: `rules[${i}].id`, message: 'Rule id is required', severity: 'error' });
                if (!rule.name)
                    errors.push({ path: `rules[${i}].name`, message: 'Rule name is required', severity: 'error' });
                if (!rule.severity)
                    errors.push({ path: `rules[${i}].severity`, message: 'Rule severity is required', severity: 'error' });
            }
        }
        // Validate guardrails
        if (json.guardrails) {
            if (!Array.isArray(json.guardrails.rules)) {
                errors.push({ path: 'guardrails.rules', message: 'guardrails.rules must be an array', severity: 'error' });
            }
            if (json.guardrails.onViolation && !['block', 'warn', 'log'].includes(json.guardrails.onViolation)) {
                errors.push({ path: 'guardrails.onViolation', message: `Invalid onViolation: ${json.guardrails.onViolation}`, severity: 'error' });
            }
        }
        // Validate tools array
        if (!Array.isArray(json.tools)) {
            errors.push({ path: 'tools', message: 'tools must be an array', severity: 'error' });
        }
        else {
            for (let i = 0; i < json.tools.length; i++) {
                const tool = json.tools[i];
                if (!tool.id)
                    errors.push({ path: `tools[${i}].id`, message: 'Tool id is required', severity: 'error' });
                if (!tool.name)
                    errors.push({ path: `tools[${i}].name`, message: 'Tool name is required', severity: 'error' });
                if (!tool.inputSchema)
                    errors.push({ path: `tools[${i}].inputSchema`, message: 'Tool inputSchema is required', severity: 'error' });
            }
        }
        // Validate optional sub-profiles
        if (json.framework) {
            if (!json.framework.id)
                errors.push({ path: 'framework.id', message: 'FrameworkProfile.id is required', severity: 'error' });
            if (!json.framework.name)
                errors.push({ path: 'framework.name', message: 'FrameworkProfile.name is required', severity: 'error' });
        }
        if (json.platforms) {
            if (!Array.isArray(json.platforms)) {
                errors.push({ path: 'platforms', message: 'platforms must be an array', severity: 'error' });
            }
            else {
                for (let i = 0; i < json.platforms.length; i++) {
                    const p = json.platforms[i];
                    if (!p.id)
                        errors.push({ path: `platforms[${i}].id`, message: 'PlatformProfile.id is required', severity: 'error' });
                    if (!p.name)
                        errors.push({ path: `platforms[${i}].name`, message: 'PlatformProfile.name is required', severity: 'error' });
                }
            }
        }
        if (json.project) {
            if (!json.project.name)
                errors.push({ path: 'project.name', message: 'ProjectProfile.name is required', severity: 'error' });
            if (!json.project.language)
                errors.push({ path: 'project.language', message: 'ProjectProfile.language is required', severity: 'error' });
            if (!json.project.dependencies)
                errors.push({ path: 'project.dependencies', message: 'ProjectProfile.dependencies is required', severity: 'error' });
        }
        if (json.organization) {
            if (!json.organization.id)
                errors.push({ path: 'organization.id', message: 'OrganizationProfile.id is required', severity: 'error' });
            if (!Array.isArray(json.organization.policies))
                errors.push({ path: 'organization.policies', message: 'OrganizationProfile.policies must be an array', severity: 'error' });
        }
        return {
            valid: errors.filter(e => e.severity === 'error').length === 0,
            errors,
        };
    }
}
exports.EngineeringProfile = EngineeringProfile;
// ─── Internal helpers ─────────────────────────────────────────────────────
function isValidSemver(version) {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(version);
}
function mergeRuleSets(base, override) {
    const overrideIds = new Set(override.map(r => r.id));
    const baseFiltered = base.filter(r => !overrideIds.has(r.id));
    return [...baseFiltered, ...override];
}
function mergeGuardrailSets(base, override) {
    if (!override)
        return base ?? { rules: [] };
    if (!base)
        return override;
    return {
        rules: mergeRuleSets(base.rules, override.rules),
        onViolation: (override.onViolation ?? base.onViolation),
        config: { ...base.config, ...override.config },
    };
}
function mergeToolSets(base, override) {
    const overrideIds = new Set(override.map(t => t.id));
    const baseFiltered = base.filter(t => !overrideIds.has(t.id));
    return [...baseFiltered, ...override];
}
function mergePlatformSets(base, override) {
    const overrideIds = new Set(override.map(p => p.id));
    const baseFiltered = base.filter(p => !overrideIds.has(p.id));
    return [...baseFiltered, ...override];
}
