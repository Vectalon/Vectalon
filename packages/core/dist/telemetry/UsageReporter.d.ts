export declare class UsageReporter {
    private static denied;
    private readonly sessionId;
    static isEnabled(): boolean;
    static enable(): void;
    static disable(): void;
    track(event: string, product: string, feature?: string, metadata?: Record<string, unknown>): void;
    flush(): Promise<void>;
    private project;
    private readQueue;
    private writeQueue;
}
