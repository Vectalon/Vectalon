/**
 * VectalonConfig — Shared configuration store
 * Business Source License 1.1 (BSL-1.1)
 */
export declare class VectalonConfig {
    static load(): Record<string, unknown>;
    static save(): void;
    static get(key: string): unknown;
    static set(key: string, value: unknown): void;
    static reset(): void;
    static all(): Record<string, unknown>;
}
