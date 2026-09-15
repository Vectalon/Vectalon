export type CommercialStatus = 'pending' | 'active' | 'past-due' | 'paused' | 'canceled' | 'expired' | 'refunded' | 'disputed' | 'pending-review';
export type CommercialEventType = 'subscription_started' | 'subscription_updated' | 'subscription_renewed' | 'payment_failed' | 'payment_recovered' | 'subscription_paused' | 'subscription_resumed' | 'subscription_canceled' | 'subscription_expired' | 'order_refunded' | 'payment_disputed' | 'unknown';
export interface CommercialOffer {
    catalogVersion: string;
    planId: string;
    productScope: readonly string[];
    tier: 'pro' | 'team' | 'enterprise';
    seats: number;
}
export interface CommercialEvent {
    id: string;
    provider: string;
    providerSequence: number;
    occurredAt: number;
    type: CommercialEventType;
    subscriptionId: string;
    customerId: string;
    offer: CommercialOffer;
    periodEndsAt: number;
    graceEndsAt?: number;
    currency: string;
    amountMinor: number;
    rawStatus?: string;
}
export interface CommercialSnapshot {
    status: Exclude<CommercialStatus, 'pending-review'>;
    offer: CommercialOffer | null;
    customerId: string | null;
    periodEndsAt: number | null;
    graceEndsAt: number | null;
    reason: string;
}
export interface CommercialState extends Omit<CommercialSnapshot, 'status'> {
    subscriptionId: string;
    status: CommercialStatus;
    lastSafeState: CommercialSnapshot | null;
    appliedEventIds: readonly string[];
    events: readonly CommercialEvent[];
}
export type CommercialEntitlementPolicy = Readonly<{
    action: 'grant' | 'retain' | 'hold' | 'suspend' | 'revoke' | 'expire';
    reason: string;
}>;
