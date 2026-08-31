"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCapabilityCatalog = validateCapabilityCatalog;
exports.checkCapabilityAvailability = checkCapabilityAvailability;
exports.validateCapabilityTransition = validateCapabilityTransition;
/**
 * Product-neutral capability qualification and availability.
 * Business Source License 1.1 (BSL-1.1). See LICENSE.
 */
const contracts_1 = require("../contracts");
const progression = ['planned', 'experimental', 'beta', 'release-candidate', 'available'];
const qualification = {
    planned: [],
    experimental: ['implementation'],
    beta: ['implementation', 'customer-workflow'],
    'release-candidate': ['implementation', 'customer-workflow', 'failure-mode', 'performance'],
    available: ['implementation', 'customer-workflow', 'failure-mode', 'performance', 'support'],
    deprecated: ['implementation', 'customer-workflow', 'failure-mode', 'performance', 'support'],
    removed: [],
};
// Catalog versions are canonical release triples, not floating ranges or prereleases.
function compareVersions(a, b) {
    const left = a.split('.').map(BigInt);
    const right = b.split('.').map(BigInt);
    for (let index = 0; index < 3; index++) {
        if (left[index] < right[index])
            return -1;
        if (left[index] > right[index])
            return 1;
    }
    return 0;
}
function declarationErrors(entry, productVersion, path, requireQualification = true) {
    const errors = [];
    const add = (field, code) => { errors.push({ path: `${path}/${field}`, code }); };
    const { min, maxExclusive } = entry.support.productVersions;
    if (maxExclusive && compareVersions(min, maxExclusive) >= 0)
        add('support/productVersions', 'invalid-version-range');
    const shouldBeImplemented = entry.lifecycle !== 'planned' && entry.lifecycle !== 'removed';
    if (entry.implemented !== shouldBeImplemented)
        add('implemented', 'inconsistent-implementation');
    for (const [index, evidence] of entry.evidence.entries()) {
        const time = Date.parse(evidence.recordedAt);
        if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== evidence.recordedAt.slice(0, 19)) {
            add(`evidence/${index}/recordedAt`, 'invalid-evidence-date');
        }
    }
    if (requireQualification) {
        for (const kind of qualification[entry.lifecycle]) {
            const records = entry.evidence.filter(evidence => evidence.kind === kind
                && evidence.productVersion === productVersion && evidence.capabilityVersion === entry.version);
            if (!records.length || records.some(evidence => evidence.status !== 'passed'))
                add('evidence', 'insufficient-evidence');
        }
        if (qualification[entry.lifecycle].length >= 2 && (!entry.tests.length || !entry.docs.length)) {
            add('tests', 'incomplete-qualification');
        }
        if (qualification[entry.lifecycle].includes('failure-mode') && !entry.failureModes.length) {
            add('failureModes', 'incomplete-qualification');
        }
    }
    const needsNotice = entry.lifecycle === 'deprecated' || entry.lifecycle === 'removed';
    if (needsNotice && !entry.deprecation)
        add('deprecation', 'missing-deprecation');
    // Lower lifecycle states may retain an already-announced deprecation after
    // qualification is demoted. The cutoff remains effective and auditable.
    if (entry.deprecation) {
        const { noticeVersion, removalVersion } = entry.deprecation;
        if (compareVersions(noticeVersion, removalVersion) >= 0)
            add('deprecation/removalVersion', 'invalid-removal-version');
        if (compareVersions(noticeVersion, productVersion) > 0)
            add('deprecation/noticeVersion', 'notice-not-published');
        if (entry.lifecycle === 'removed' && compareVersions(productVersion, removalVersion) < 0) {
            add('deprecation/removalVersion', 'premature-removal');
        }
    }
    return errors;
}
/** Shape and semantic validation. Evidence references are preserved, never fetched or fabricated. */
function validateCapabilityCatalog(value) {
    const shape = (0, contracts_1.validateContract)('CapabilityCatalog', value);
    if (!shape.valid)
        return shape;
    const catalog = value;
    const errors = [];
    const entries = new Map();
    for (const [index, entry] of catalog.capabilities.entries()) {
        const path = `/capabilities/${index}`;
        if (entries.has(entry.id))
            errors.push({ path: `${path}/id`, code: 'duplicate-capability' });
        entries.set(entry.id, entry);
        errors.push(...declarationErrors(entry, catalog.productVersion, path));
    }
    const visited = new Set();
    const visiting = new Set();
    const visit = (entry, path) => {
        if (visiting.has(entry.id)) {
            errors.push({ path, code: 'dependency-cycle' });
            return;
        }
        if (visited.has(entry.id))
            return;
        visiting.add(entry.id);
        for (const id of entry.dependencies) {
            const dependency = entries.get(id);
            if (!dependency)
                errors.push({ path, code: 'missing-dependency' });
            else {
                if (entry.implemented && !dependency.implemented)
                    errors.push({ path, code: 'unimplemented-dependency' });
                if (entry.support.plans.some(plan => !dependency.support.plans.includes(plan))
                    || entry.support.platforms.some(platform => !dependency.support.platforms.includes(platform))) {
                    errors.push({ path, code: 'incompatible-dependency-support' });
                }
                const parentRange = entry.support.productVersions;
                const dependencyRange = dependency.support.productVersions;
                const missesStart = compareVersions(dependencyRange.min, parentRange.min) > 0;
                const missesEnd = parentRange.maxExclusive === undefined
                    ? dependencyRange.maxExclusive !== undefined
                    : dependencyRange.maxExclusive !== undefined
                        && compareVersions(dependencyRange.maxExclusive, parentRange.maxExclusive) < 0;
                if (missesStart || missesEnd)
                    errors.push({ path, code: 'incompatible-dependency-support' });
                visit(dependency, path);
            }
        }
        visiting.delete(entry.id);
        visited.add(entry.id);
    };
    catalog.capabilities.forEach((entry, index) => visit(entry, `/capabilities/${index}/dependencies`));
    return { valid: errors.length === 0, errors };
}
/** Availability only: callers must independently evaluate entitlement and license policy. */
function checkCapabilityAvailability(value, request) {
    const deny = (reason) => ({ available: false, reason });
    if (!validateCapabilityCatalog(value).valid)
        return deny('invalid-catalog');
    const catalog = value;
    if (request.productVersion !== catalog.productVersion)
        return deny('product-version-mismatch');
    const entries = new Map(catalog.capabilities.map(entry => [entry.id, entry]));
    const entry = entries.get(request.capabilityId);
    if (!entry)
        return deny('unknown-capability');
    const checked = new Map();
    const check = (candidate) => {
        const cached = checked.get(candidate.id);
        if (cached)
            return cached;
        if (candidate.lifecycle === 'removed'
            || (candidate.deprecation && compareVersions(request.productVersion, candidate.deprecation.removalVersion) >= 0))
            return deny('removed');
        if (!candidate.implemented || candidate.lifecycle === 'planned')
            return deny('unimplemented');
        const { min, maxExclusive } = candidate.support.productVersions;
        if (compareVersions(request.productVersion, min) < 0
            || (maxExclusive && compareVersions(request.productVersion, maxExclusive) >= 0))
            return deny('unsupported-product-version');
        if (candidate.lifecycle === 'experimental' && request.experimentalOptIn !== true)
            return deny('experimental-opt-in-required');
        for (const id of candidate.dependencies) {
            const dependency = entries.get(id);
            if (!dependency || !check(dependency).available)
                return deny('dependency-unavailable');
        }
        const decision = { available: true, reason: 'available' };
        checked.set(candidate.id, decision);
        return decision;
    };
    return check(entry);
}
/**
 * Adjacent promotions require target qualification; backward demotions waive it.
 * A permitted demotion does not make an unqualified catalog grantable.
 * Removed identities remain tombstones and cannot be reused.
 */
function validateCapabilityTransition(previous, next, context) {
    const shape = (0, contracts_1.validateContract)('CapabilityCatalog', {
        contractVersion: '1.0.0', productId: 'transition', productVersion: context.productVersion, capabilities: [previous, next],
    });
    if (!shape.valid)
        return shape;
    const before = previous;
    const after = next;
    const errors = [];
    const add = (code) => { errors.push({ path: '/lifecycle', code }); };
    const from = progression.indexOf(before.lifecycle);
    const to = progression.indexOf(after.lifecycle);
    const demotion = to >= 0 && (from > to || before.lifecycle === 'deprecated');
    if (before.id !== after.id)
        errors.push({ path: '/id', code: 'identity-changed' });
    if (compareVersions(before.version, after.version) > 0)
        errors.push({ path: '/version', code: 'version-regression' });
    if (before.lifecycle === 'removed' && after.lifecycle !== 'removed')
        add('removed-terminal');
    else if (before.lifecycle !== after.lifecycle && !demotion
        && !(from >= 0 && to === from + 1)
        && !(before.lifecycle === 'available' && after.lifecycle === 'deprecated')
        && !(before.deprecation && after.lifecycle === 'removed'))
        add('illegal-transition');
    if (before.deprecation && !after.deprecation)
        errors.push({ path: '/deprecation', code: 'deprecation-dropped' });
    if (before.deprecation && after.deprecation) {
        for (const field of ['noticeVersion', 'noticeReference', 'migrationReference', 'removalVersion', 'licenseEffect']) {
            if (before.deprecation[field] !== after.deprecation[field])
                errors.push({ path: `/deprecation/${field}`, code: 'deprecation-changed' });
        }
    }
    // Prior qualification may already be disputed; structural history still must be valid.
    errors.push(...declarationErrors(before, context.productVersion, '/previous', false));
    errors.push(...declarationErrors(after, context.productVersion, '/next', !demotion));
    return { valid: errors.length === 0, errors };
}
