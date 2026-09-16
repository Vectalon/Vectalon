import type { CommercialEntitlementPolicy, CommercialEvent, CommercialState } from './types';
export declare function initialCommercialState(subscriptionId: string): CommercialState;
export declare function applyCommercialEvent(state: CommercialState, event: CommercialEvent): CommercialState;
export declare function policyForCommercialState(state: CommercialState, now: number): CommercialEntitlementPolicy;
