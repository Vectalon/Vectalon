/**
 * ContextEngine interface for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface ContextEngine {
    buildPrompt(options: PromptOptions): string;
}
export interface PromptOptions {
    project: {
        name: string;
        version: string;
        tooling: string;
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
        files: string[];
        language: string;
    };
    feature: string;
    [key: string]: unknown;
}
