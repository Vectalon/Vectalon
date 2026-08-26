"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoreHarness = createCoreHarness;
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("../contracts");
const CompositionEngine_1 = require("./CompositionEngine");
const blocks = (severity) => severity === 'error' || severity === 'block';
const MAX_DIAGNOSTICS = 100;
const MAX_SAFE_ID_LENGTH = 128;
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const safeId = (value) => value.slice(0, MAX_SAFE_ID_LENGTH);
const pathToken = (relativePath) => `path_${(0, node_crypto_1.createHash)('sha256').update(relativePath).digest('hex').slice(0, 16)}`;
const safePosition = (value) => Number.isSafeInteger(value) && value !== undefined && value >= 0 && value <= 1_000_000 ? value : undefined;
const safeSeverity = (value) => value === 'info' || value === 'warning' || value === 'error' || value === 'block' ? value : 'error';
const diagnosticOrder = (left, right) => compareText(left.ruleId ?? '', right.ruleId ?? '')
    || compareText(left.pathToken ?? '', right.pathToken ?? '')
    || (left.line ?? 0) - (right.line ?? 0)
    || (left.column ?? 0) - (right.column ?? 0)
    || compareText(left.code, right.code);
function providerMatches(provider, required) {
    const available = provider.capabilities();
    return Object.entries(required).every(([key, value]) => {
        if (value === undefined)
            return true;
        const actual = available[key];
        return typeof value === 'number' ? typeof actual === 'number' && actual >= value : actual === value;
    });
}
function selectProvider(providers, required, priority) {
    const candidates = providers.filter(provider => providerMatches(provider, required));
    const ranks = new Map(priority.map((id, index) => [id, index]));
    candidates.sort((left, right) => {
        const leftRank = ranks.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = ranks.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank || compareText(left.id, right.id);
    });
    const provider = candidates[0];
    if (!provider)
        return undefined;
    return { provider, selectionReason: ranks.has(provider.id) ? 'CONFIGURED_PRIORITY' : 'STABLE_ID' };
}
function selectedRules(rules, provenance) {
    const byRule = new Map(provenance.map(item => [item.ruleId, item.layer]));
    return rules
        .map(rule => ({ id: safeId(rule.id), version: safeId(rule.version), provenance: safeId(byRule.get(rule.id) ?? 'unknown') }))
        .sort((left, right) => compareText(left.id, right.id) || compareText(left.version, right.version));
}
function createCoreHarness(config, adapters) {
    const composition = new CompositionEngine_1.CompositionEngine();
    return {
        async run(request) {
            const startedAt = adapters.clock.now();
            let project;
            let currentChanges = request.changes.map(change => ({ ...change }));
            let repairCount = 0;
            let providerEvidence;
            const finish = (status, reason, diagnostics, rules = []) => {
                const completedAt = adapters.clock.now();
                return {
                    local: { project, changes: currentChanges },
                    safe: {
                        resultSchemaVersion: config.resultSchemaVersion ?? '1.0.0',
                        runId: request.runId,
                        capabilityId: request.capabilityId,
                        status,
                        reason,
                        coreRevision: config.coreRevision,
                        contractRevision: contracts_1.CONTRACT_REVISION,
                        profileSchemaVersion: config.profileSchemaVersion,
                        selectedRules: rules,
                        diagnostics: [...diagnostics].sort(diagnosticOrder).slice(0, MAX_DIAGNOSTICS),
                        ...(providerEvidence ? { provider: providerEvidence } : {}),
                        repairCount,
                        startedAt,
                        completedAt,
                        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
                        redaction: 'metadata-only',
                    },
                };
            };
            if (request.repair?.enabled && (!Number.isInteger(request.repair.maxAttempts)
                || !Number.isFinite(request.repair.maxAttempts)
                || request.repair.maxAttempts < 1
                || request.repair.maxAttempts > 10)) {
                return finish('failed', 'INVALID_REQUEST', [{ code: 'INVALID_REQUEST', severity: 'error' }]);
            }
            let discovery;
            try {
                discovery = await adapters.discovery.discover({ projectLocator: request.projectLocator });
                project = discovery.project;
            }
            catch {
                return finish('failed', 'DISCOVERY_FAILED', [{ code: 'DISCOVERY_FAILED', severity: 'error' }]);
            }
            const composed = composition.compose([...request.profileInputs, { layer: 'project', source: project }]);
            const rules = [...composed.profile.rules].sort((left, right) => compareText(left.id, right.id) || compareText(left.version, right.version));
            const ruleEvidence = selectedRules(rules, composed.provenance);
            const validate = async (changes) => {
                const diagnostics = [];
                let blocked = false;
                const record = (diagnostic) => {
                    const isBlocking = blocks(diagnostic.severity);
                    blocked ||= isBlocking;
                    if (diagnostics.length < MAX_DIAGNOSTICS)
                        diagnostics.push(diagnostic);
                    else if (isBlocking && !diagnostics.some(item => item.pathToken === diagnostic.pathToken && blocks(item.severity))) {
                        const replaceIndex = diagnostics.findIndex(item => !blocks(item.severity));
                        if (replaceIndex >= 0)
                            diagnostics[replaceIndex] = diagnostic;
                    }
                };
                for (const item of discovery.diagnostics)
                    record({
                        code: 'DISCOVERY_DIAGNOSTIC',
                        severity: safeSeverity(item.severity),
                    });
                for (const rule of rules) {
                    try {
                        if (adapters.ruleExecution.supports && !adapters.ruleExecution.supports(rule)) {
                            return {
                                reason: 'RULE_UNAVAILABLE',
                                blocked: true,
                                diagnostics: [{ code: 'RULE_UNAVAILABLE', severity: 'error', ruleId: safeId(rule.id) }],
                            };
                        }
                    }
                    catch {
                        return {
                            reason: 'RULE_EXECUTION_FAILED',
                            blocked: true,
                            diagnostics: [{ code: 'RULE_EXECUTION_FAILED', severity: 'error', ruleId: safeId(rule.id) }],
                        };
                    }
                    for (const change of [...changes].sort((left, right) => compareText(left.relativePath, right.relativePath) || compareText(left.id, right.id))) {
                        try {
                            const violations = await adapters.ruleExecution.execute({ rule, change, project: discovery.project });
                            for (const item of violations)
                                record({
                                    code: 'RULE_VIOLATION',
                                    severity: safeSeverity(item.severity),
                                    ruleId: safeId(rule.id),
                                    pathToken: pathToken(change.relativePath),
                                    ...(safePosition(item.line) !== undefined ? { line: safePosition(item.line) } : {}),
                                    ...(safePosition(item.column) !== undefined ? { column: safePosition(item.column) } : {}),
                                });
                        }
                        catch {
                            return {
                                reason: 'RULE_EXECUTION_FAILED',
                                blocked: true,
                                diagnostics: [{ code: 'RULE_EXECUTION_FAILED', severity: 'error', ruleId: safeId(rule.id), pathToken: pathToken(change.relativePath) }],
                            };
                        }
                    }
                }
                return { diagnostics: diagnostics.sort(diagnosticOrder), blocked };
            };
            let validation = await validate(currentChanges);
            if (validation.reason)
                return finish('failed', validation.reason, validation.diagnostics, ruleEvidence);
            if (!validation.blocked) {
                return finish('passed', 'PASSED', validation.diagnostics, ruleEvidence);
            }
            if (!request.repair?.enabled || request.repair.maxAttempts <= 0) {
                return finish('blocked', 'GUARDRAIL_BLOCKED', validation.diagnostics, ruleEvidence);
            }
            let selected;
            try {
                selected = selectProvider(adapters.providers ?? [], request.requiredProviderCapabilities ?? {}, config.providerPriority ?? []);
            }
            catch {
                return finish('failed', 'PROVIDER_FAILED', validation.diagnostics, ruleEvidence);
            }
            if (!selected)
                return finish('failed', 'PROVIDER_UNAVAILABLE', validation.diagnostics, ruleEvidence);
            providerEvidence = { id: safeId(selected.provider.id), selectionReason: selected.selectionReason };
            const seen = currentChanges.map(change => new Set([change.content]));
            for (let attempt = 0; attempt < request.repair.maxAttempts; attempt += 1) {
                const targetIndex = currentChanges.findIndex(change => validation.diagnostics.some(item => item.pathToken === pathToken(change.relativePath) && blocks(item.severity)));
                if (targetIndex < 0)
                    break;
                const target = currentChanges[targetIndex];
                let response;
                try {
                    response = await selected.provider.generate({
                        messages: [
                            {
                                role: 'system',
                                content: JSON.stringify({
                                    instruction: 'Repair the supplied file. Return only the complete corrected file contents.',
                                    rules: rules.map(rule => ({ id: rule.id, description: rule.description })),
                                    violations: validation.diagnostics.filter(item => item.pathToken === pathToken(target.relativePath)),
                                }),
                            },
                            { role: 'user', content: target.content },
                        ],
                        temperature: 0,
                        metadata: { capabilityId: request.capabilityId, ruleIds: rules.map(rule => rule.id) },
                    });
                }
                catch {
                    return finish('failed', 'PROVIDER_FAILED', validation.diagnostics, ruleEvidence);
                }
                const candidate = response.message.content;
                repairCount += 1;
                providerEvidence = { ...providerEvidence, ...(response.model ? { model: safeId(response.model) } : {}) };
                if (seen[targetIndex].has(candidate))
                    break;
                seen[targetIndex].add(candidate);
                currentChanges = currentChanges.map((change, index) => index === targetIndex ? { ...change, content: candidate } : change);
                validation = await validate(currentChanges);
                if (validation.reason)
                    return finish('failed', validation.reason, validation.diagnostics, ruleEvidence);
                if (!validation.blocked) {
                    return finish('repaired', 'REPAIR_SUCCEEDED', validation.diagnostics, ruleEvidence);
                }
            }
            return finish('failed', 'REPAIR_EXHAUSTED', validation.diagnostics, ruleEvidence);
        },
    };
}
