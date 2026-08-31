export declare const CONTRACT_NAMES: readonly ["Capability", "CapabilityCatalog", "DiagnosticResult", "EntitlementDecision", "ErrorEnvelope", "IdentityReference", "LicenseClaims", "ProductDefinition", "TelemetryEvent", "TrialCredential"];
export type ContractName = (typeof CONTRACT_NAMES)[number];
type Schema = Record<string, any>;
export declare const CONTRACT_SCHEMAS: Record<ContractName, Schema>;
export declare const CONTRACT_REVISION: string;
export declare function generateRegistryManifest(): {
    contractVersion: string;
    revision: string;
    generator: {
        name: string;
        version: string;
    };
    typeProjectionDigest: string;
    compatibility: {
        unknownFields: string;
        unknownMajorVersions: string;
        previousMajorVersions: string;
    };
    schemas: {
        name: "Capability" | "CapabilityCatalog" | "DiagnosticResult" | "EntitlementDecision" | "ErrorEnvelope" | "IdentityReference" | "LicenseClaims" | "ProductDefinition" | "TelemetryEvent" | "TrialCredential";
        owner: string;
        id: string;
        version: string;
        digest: string;
        status: string;
    }[];
};
export declare function findBreakingSchemaChanges(previous: Schema, candidate: Schema, path?: string): string[];
export interface ContractValidationError {
    path: string;
    code: string;
}
export interface ContractValidationResult {
    valid: boolean;
    errors: ContractValidationError[];
}
export declare function validateContract(name: ContractName, value: unknown): ContractValidationResult;
export declare function generateContractTypes(): string;
export {};
