/**
 * Config types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface ConfigOptions {
    modelProvider: string;
    modelConfig: Record<string, unknown>;
    agentProtocol: string;
    autoScan: boolean;
    learningEnabled: boolean;
    sdlcModules: string[];
    embeddingProvider: string;
}
export declare const DEFAULTS: ConfigOptions;
