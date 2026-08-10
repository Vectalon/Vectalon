/**
 * Telemetry types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface TelemetryEvent {
    event: string;
    product: string;
    feature?: string;
    tier: string;
    timestamp: number;
    sessionId: string;
    deviceId: string;
    metadata?: Record<string, unknown>;
}
export interface TelemetryBatch {
    events: TelemetryEvent[];
    sentAt?: number;
}
