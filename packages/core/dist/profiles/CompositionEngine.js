"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositionEngine = exports.DEFAULT_PRECEDENCE = exports.LAYER_ORDER = void 0;
exports.composeProfiles = composeProfiles;
const EngineeringProfile_1 = require("./EngineeringProfile");
/**
 * The six layers ordered from lowest to highest precedence.
 * This is the authoritative ordering used throughout the engine.
 */
exports.LAYER_ORDER = [
    'language',
    'framework',
    'platform',
    'project',
    'organization',
    'system',
];
/**
 * Default precedence: language(0) < framework(1) < platform(2) < project(3)
 * < organization(4) < system(5).
 *
 * This encodes the principle that organization policy overrides framework
 * defaults, project overrides platform, and system overrides everything.
 */
exports.DEFAULT_PRECEDENCE = {
    language: 0,
    framework: 1,
    platform: 2,
    project: 3,
    organization: 4,
    system: 5,
};
// ─── Engine ───────────────────────────────────────────────────────────────
/**
 * CompositionEngine — deterministic profile composition.
 *
 * Design:
 * - Stateless — each compose() call is independent.
 * - Deterministic — same inputs always produce the same output.
 * - Configurable precedence via PrecedenceMap.
 * - Full diagnostics (conflicts + provenance) for transparency.
 */
class CompositionEngine {
    precedence;
    constructor(precedence = exports.DEFAULT_PRECEDENCE) {
        this.precedence = { ...precedence };
    }
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
    compose(inputs, options = {}) {
        const id = options.id ?? 'composed';
        const version = options.version ?? '1.0.0';
        const precedence = options.precedence ?? this.precedence;
        // 1. Classify inputs into layers
        const byLayer = classifyInputs(inputs);
        // 2. Resolve rules across layers
        const { resolvedRules, conflicts, provenance } = resolveRules(byLayer, precedence);
        // 3. Resolve tools
        const resolvedTools = resolveTools(byLayer, precedence);
        // 4. Resolve config (merge objects, higher precedence wins)
        const resolvedConfig = resolveConfig(byLayer, precedence);
        // 5. Pick scalar fields from highest-precedence input
        const language = pickHighestPrecedenceLanguage(byLayer, precedence);
        const framework = pickHighestPrecedenceFramework(byLayer, precedence);
        const platforms = collectPlatforms(byLayer);
        const project = pickHighestPrecedence(byLayer, 'project', precedence);
        const organization = pickHighestPrecedence(byLayer, 'organization', precedence);
        // 6. Build guardrails
        const guardrails = {
            rules: resolvedRules,
            onViolation: 'warn',
            config: resolvedConfig.guardrails,
        };
        const profile = {
            id,
            version,
            schemaVersion: EngineeringProfile_1.CURRENT_SCHEMA_VERSION,
            language,
            framework,
            platforms,
            project,
            organization,
            rules: resolvedRules,
            guardrails,
            tools: resolvedTools,
            metadata: {
                createdAt: new Date().toISOString(),
                description: `Composed from ${inputs.length} input(s) across ${new Set(inputs.map(i => i.layer)).size} layer(s)`,
                tags: Array.from(new Set(inputs.map(i => i.layer))),
            },
        };
        return { profile, conflicts, provenance, precedence };
    }
}
exports.CompositionEngine = CompositionEngine;
function classifyInputs(inputs) {
    const result = {
        language: [],
        framework: [],
        platform: [],
        project: [],
        organization: [],
        system: [],
    };
    for (const input of inputs) {
        result[input.layer].push(input.source);
    }
    return result;
}
function extractRules(classified, layer) {
    const result = [];
    switch (layer) {
        case 'language':
            for (const lang of classified.language) {
                for (const ruleId of lang.rules ?? []) {
                    result.push({
                        rule: {
                            id: ruleId,
                            version: '1.0.0',
                            name: ruleId,
                            description: `Language rule: ${ruleId}`,
                            severity: 'warning',
                            category: 'correctness',
                            appliesTo: lang.fileExtensions?.map(ext => `*${ext}`) ?? ['*'],
                            check: () => [],
                        },
                        sourceId: lang.id,
                    });
                }
            }
            break;
        case 'framework':
            for (const fw of classified.framework) {
                for (const rule of fw.rules ?? []) {
                    result.push({ rule, sourceId: fw.id });
                }
            }
            break;
        case 'platform':
            for (const plat of classified.platform) {
                for (const rule of plat.rules ?? []) {
                    result.push({ rule, sourceId: plat.id });
                }
            }
            break;
        case 'organization':
            for (const org of classified.organization) {
                for (const policy of org.policies ?? []) {
                    // Convert OrgPolicy to EngineeringRule
                    result.push({
                        rule: {
                            id: policy.id,
                            version: '1.0.0',
                            name: policy.rule,
                            description: policy.rule,
                            severity: policy.severity,
                            category: 'architecture',
                            appliesTo: policy.appliesTo ?? ['*'],
                            check: () => [],
                        },
                        sourceId: org.id,
                    });
                }
            }
            break;
        case 'system':
            for (const sys of classified.system) {
                for (const rule of sys.rules ?? []) {
                    result.push({ rule, sourceId: sys.id ?? 'system' });
                }
            }
            break;
        case 'project':
            // Project constraints become rules
            for (const proj of classified.project) {
                for (const constraint of proj.constraints ?? []) {
                    result.push({
                        rule: {
                            id: constraint.id,
                            version: '1.0.0',
                            name: constraint.description,
                            description: constraint.description,
                            severity: constraint.severity,
                            category: 'architecture',
                            appliesTo: ['*'],
                            check: () => [],
                        },
                        sourceId: proj.name,
                    });
                }
            }
            break;
    }
    return result;
}
function resolveRules(classified, precedence) {
    const conflicts = [];
    const provenance = [];
    // Track best rule per id: { ruleId → { rule, layer, sourceId, precedenceValue } }
    const bestByRuleId = new Map();
    // Process layers from lowest to highest precedence
    const sortedLayers = exports.LAYER_ORDER.slice().sort((a, b) => precedence[a] - precedence[b]);
    for (const layer of sortedLayers) {
        const extracted = extractRules(classified, layer);
        for (const { rule, sourceId } of extracted) {
            const existing = bestByRuleId.get(rule.id);
            if (!existing) {
                // First time seeing this rule id
                bestByRuleId.set(rule.id, {
                    rule,
                    layer,
                    sourceId,
                    precedenceValue: precedence[layer],
                });
                provenance.push({ ruleId: rule.id, layer, sourceId });
            }
            else if (precedence[layer] >= existing.precedenceValue && layer === existing.layer) {
                // Same layer: later input wins (allows multiple inputs per layer)
                conflicts.push({
                    ruleId: rule.id,
                    overriddenBy: layer,
                    overriddenFrom: existing.layer,
                    winningRule: rule,
                    losingRule: existing.rule,
                });
                bestByRuleId.set(rule.id, {
                    rule,
                    layer,
                    sourceId,
                    precedenceValue: precedence[layer],
                });
                const provIdx = provenance.findIndex(p => p.ruleId === rule.id);
                if (provIdx !== -1) {
                    provenance[provIdx] = { ruleId: rule.id, layer, sourceId };
                }
                else {
                    provenance.push({ ruleId: rule.id, layer, sourceId });
                }
            }
            else if (precedence[layer] > existing.precedenceValue) {
                // This layer has higher precedence — override
                conflicts.push({
                    ruleId: rule.id,
                    overriddenBy: layer,
                    overriddenFrom: existing.layer,
                    winningRule: rule,
                    losingRule: existing.rule,
                });
                bestByRuleId.set(rule.id, {
                    rule,
                    layer,
                    sourceId,
                    precedenceValue: precedence[layer],
                });
                // Update provenance
                const provIdx = provenance.findIndex(p => p.ruleId === rule.id);
                if (provIdx !== -1) {
                    provenance[provIdx] = { ruleId: rule.id, layer, sourceId };
                }
                else {
                    provenance.push({ ruleId: rule.id, layer, sourceId });
                }
            }
            // else: existing has higher or equal precedence — keep it
        }
    }
    const resolvedRules = Array.from(bestByRuleId.values()).map(e => e.rule);
    return { resolvedRules, conflicts, provenance };
}
// ─── Internal: Tool resolution ────────────────────────────────────────────
function extractTools(classified, layer) {
    const result = [];
    switch (layer) {
        case 'system':
            for (const sys of classified.system) {
                for (const tool of sys.tools ?? []) {
                    result.push({ tool, sourceId: sys.id ?? 'system' });
                }
            }
            break;
        case 'framework':
            // Frameworks can define tools via config
            for (const fw of classified.framework) {
                const tools = fw.config?.tools ?? [];
                for (const tool of tools) {
                    result.push({ tool, sourceId: fw.id });
                }
            }
            break;
        default:
            break;
    }
    return result;
}
function resolveTools(classified, precedence) {
    const bestByToolId = new Map();
    const sortedLayers = exports.LAYER_ORDER.slice().sort((a, b) => precedence[a] - precedence[b]);
    for (const layer of sortedLayers) {
        const extracted = extractTools(classified, layer);
        for (const { tool } of extracted) {
            const existing = bestByToolId.get(tool.id);
            if (!existing || precedence[layer] > existing.precedenceValue) {
                bestByToolId.set(tool.id, { tool, precedenceValue: precedence[layer] });
            }
        }
    }
    return Array.from(bestByToolId.values()).map(e => e.tool);
}
// ─── Internal: Config resolution ──────────────────────────────────────────
function extractConfig(classified, layer) {
    switch (layer) {
        case 'language':
            return classified.language[0]?.config;
        case 'framework':
            return classified.framework[0]?.config;
        case 'platform':
            return classified.platform[0]?.config;
        case 'project':
            return undefined; // projects don't have freeform config
        case 'organization':
            return classified.organization[0]?.config;
        case 'system':
            return classified.system[0]?.guardrails?.config;
        default:
            return undefined;
    }
}
function resolveConfig(classified, precedence) {
    const merged = {};
    const sortedLayers = exports.LAYER_ORDER.slice().sort((a, b) => precedence[a] - precedence[b]);
    for (const layer of sortedLayers) {
        const config = extractConfig(classified, layer);
        if (config) {
            Object.assign(merged, config);
        }
    }
    return { guardrails: merged };
}
// ─── Internal: Scalar field resolution ────────────────────────────────────
function pickHighestPrecedence(classified, layer, precedence) {
    const sortedLayers = exports.LAYER_ORDER.slice().sort((a, b) => precedence[a] - precedence[b]);
    let best;
    let bestPrecedence = -1;
    for (const l of sortedLayers) {
        if (l !== layer)
            continue;
        const items = classified[l];
        if (items.length > 0 && precedence[l] > bestPrecedence) {
            best = items[items.length - 1]; // last in layer wins
            bestPrecedence = precedence[l];
        }
    }
    return best;
}
function pickHighestPrecedenceLanguage(classified, _precedence) {
    if (classified.language.length === 0) {
        // Fallback: create a minimal language profile
        return {
            id: 'unknown',
            name: 'Unknown',
            features: {
                typing: 'dynamic',
                concurrency: 'event-loop',
                errorHandling: 'exceptions',
                moduleSystem: 'esm',
            },
        };
    }
    // All language inputs are at the same layer, so pick the first (most specific)
    return classified.language[0];
}
function pickHighestPrecedenceFramework(classified, precedence) {
    if (classified.framework.length === 0)
        return undefined;
    // Pick the last framework (most specific / overriding)
    return classified.framework[classified.framework.length - 1];
}
function collectPlatforms(classified) {
    if (classified.platform.length === 0)
        return undefined;
    return classified.platform;
}
// ─── Convenience: composeProfiles ─────────────────────────────────────────
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
function composeProfiles(inputs, options) {
    const engine = new CompositionEngine(options?.precedence);
    const classified = inputs.map(classifyInput);
    return engine.compose(classified, options);
}
/**
 * Auto-classify a raw profile into a CompositionInput based on its shape.
 */
function classifyInput(input) {
    // Language: has `features` with typing field
    if ('features' in input && input.features && 'typing' in input.features) {
        return { layer: 'language', source: input };
    }
    // Organization: has `policies` array
    if ('policies' in input && Array.isArray(input.policies)) {
        return { layer: 'organization', source: input };
    }
    // Project: has `dependencies` object
    if ('dependencies' in input && typeof input.dependencies === 'object') {
        return { layer: 'project', source: input };
    }
    // Platform: has `sdk` or `buildSystem` or `packageManagers` or `fileExtensions`
    if ('sdk' in input || 'buildSystem' in input || 'packageManagers' in input || 'fileExtensions' in input) {
        return { layer: 'platform', source: input };
    }
    // Framework: has `lifecycle` or `inherits` or `pitfalls`
    if ('lifecycle' in input || 'inherits' in input || 'pitfalls' in input) {
        return { layer: 'framework', source: input };
    }
    // Fallback: if it has rules, treat as framework
    return { layer: 'framework', source: input };
}
