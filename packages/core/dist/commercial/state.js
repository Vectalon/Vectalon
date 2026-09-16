"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialCommercialState = initialCommercialState;
exports.applyCommercialEvent = applyCommercialEvent;
exports.policyForCommercialState = policyForCommercialState;
function initialCommercialState(subscriptionId) {
    if (!subscriptionId.trim())
        throw new Error('commercial-subscription-id-required');
    return Object.freeze({ subscriptionId, status: 'pending', offer: null, customerId: null, periodEndsAt: null, graceEndsAt: null, reason: 'awaiting-provider-state', lastSafeState: null, appliedEventIds: Object.freeze([]), events: Object.freeze([]) });
}
function applyCommercialEvent(state, event) {
    validateEvent(state.subscriptionId, event);
    if (state.events.some(existing => existing.id === event.id))
        return state;
    return project(state.subscriptionId, [...state.events, freezeEvent(event)].sort(compareEvents));
}
function policyForCommercialState(state, now) {
    switch (state.status) {
        case 'active': return { action: 'grant', reason: 'subscription-active' };
        case 'past-due': return state.graceEndsAt !== null && now < state.graceEndsAt ? { action: 'retain', reason: 'payment-grace' } : { action: 'suspend', reason: 'payment-grace-ended' };
        case 'paused': return { action: 'suspend', reason: 'subscription-paused' };
        case 'canceled': return state.periodEndsAt !== null && now < state.periodEndsAt ? { action: 'retain', reason: 'canceled-through-paid-period' } : { action: 'expire', reason: 'canceled-period-ended' };
        case 'expired': return { action: 'expire', reason: 'subscription-expired' };
        case 'refunded': return { action: 'revoke', reason: 'order-refunded' };
        case 'disputed': return { action: 'suspend', reason: 'payment-disputed' };
        case 'pending-review': return { action: 'hold', reason: 'commercial-state-pending-review' };
        case 'pending': return { action: 'hold', reason: 'commercial-state-pending' };
    }
}
function project(subscriptionId, events) {
    let snapshot = initialCommercialState(subscriptionId);
    let lastSafeState = null;
    for (const event of events) {
        const next = projectOne(snapshot, event);
        if (next.status === 'pending-review' && snapshot.status !== 'pending-review')
            lastSafeState = asSnapshot(snapshot);
        snapshot = { ...snapshot, ...next };
    }
    return Object.freeze({ ...snapshot, subscriptionId, lastSafeState, appliedEventIds: Object.freeze(events.map(event => event.id)), events: Object.freeze([...events]) });
}
function projectOne(current, event) {
    if (event.type === 'unknown' || (current.offer !== null && !sameOffer(current.offer, event.offer)))
        return { status: 'pending-review', offer: current.offer, customerId: current.customerId, periodEndsAt: current.periodEndsAt, graceEndsAt: current.graceEndsAt, reason: event.type === 'unknown' ? 'unknown-provider-state' : 'offer-change-requires-review' };
    const common = { offer: event.offer, customerId: event.customerId, periodEndsAt: event.periodEndsAt };
    switch (event.type) {
        case 'subscription_started':
        case 'subscription_renewed':
        case 'payment_recovered':
        case 'subscription_resumed': return { ...common, status: 'active', graceEndsAt: null, reason: event.type };
        case 'subscription_updated': return { ...common, status: current.status, graceEndsAt: current.graceEndsAt, reason: event.type };
        case 'payment_failed': return { ...common, status: 'past-due', graceEndsAt: event.graceEndsAt ?? null, reason: event.type };
        case 'subscription_paused': return { ...common, status: 'paused', graceEndsAt: null, reason: event.type };
        case 'subscription_canceled': return { ...common, status: 'canceled', graceEndsAt: null, reason: event.type };
        case 'subscription_expired': return { ...common, status: 'expired', graceEndsAt: null, reason: event.type };
        case 'order_refunded': return { ...common, status: 'refunded', graceEndsAt: null, reason: event.type };
        case 'payment_disputed': return { ...common, status: 'disputed', graceEndsAt: null, reason: event.type };
    }
}
function validateEvent(subscriptionId, event) {
    if (!event.id.trim() || !event.provider.trim() || event.subscriptionId !== subscriptionId || !event.customerId.trim())
        throw new Error('commercial-event-identity-invalid');
    if (!Number.isSafeInteger(event.providerSequence) || event.providerSequence < 0 || !Number.isSafeInteger(event.occurredAt) || !Number.isSafeInteger(event.periodEndsAt))
        throw new Error('commercial-event-time-invalid');
    if (!/^[A-Z]{3}$/.test(event.currency) || !Number.isSafeInteger(event.amountMinor) || event.amountMinor < 0)
        throw new Error('commercial-event-money-invalid');
    if (!event.offer.catalogVersion.trim() || !event.offer.planId.trim() || !event.offer.productScope.length || !event.offer.productScope.every(Boolean) || !Number.isSafeInteger(event.offer.seats) || event.offer.seats < 1)
        throw new Error('commercial-event-offer-invalid');
}
function compareEvents(left, right) { return left.providerSequence - right.providerSequence || left.occurredAt - right.occurredAt || left.id.localeCompare(right.id); }
function sameOffer(left, right) { return left.catalogVersion === right.catalogVersion && left.planId === right.planId && left.tier === right.tier && left.seats === right.seats && JSON.stringify(left.productScope) === JSON.stringify(right.productScope); }
function freezeEvent(event) { return Object.freeze({ ...event, offer: Object.freeze({ ...event.offer, productScope: Object.freeze([...event.offer.productScope]) }) }); }
function asSnapshot(state) { return Object.freeze({ status: state.status === 'pending-review' ? 'pending' : state.status, offer: state.offer, customerId: state.customerId, periodEndsAt: state.periodEndsAt, graceEndsAt: state.graceEndsAt, reason: state.reason }); }
