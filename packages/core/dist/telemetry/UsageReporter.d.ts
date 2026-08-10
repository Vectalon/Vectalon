/**
 * UsageReporter — Anonymous, opt-in telemetry
 * Business Source License 1.1 (BSL-1.1)
 */
export declare class UsageReporter {
    private enabled;
    constructor();
    static isEnabled(): boolean;
    static enable(): void;
    static disable(): void;
    track(event: string, product: string, feature?: string, metadata?: Record<string, unknown>): void;
    flush(): Promise<void>;
    private readEnabled;
    private enqueue;
    private readQueue;
    private writeQueue;
    private clearQueue;
    private getSessionId;
    private getDeviceId;
}
