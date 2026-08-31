"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extensionCommandDecisionFrom = extensionCommandDecisionFrom;
exports.extensionCommandDecision = extensionCommandDecision;
exports.extensionCommandLabel = extensionCommandLabel;
const capability_status_generated_json_1 = __importDefault(require("./capability-status.generated.json"));
const statuses = capability_status_generated_json_1.default;
function extensionCommandDecisionFrom(records, command, experimentalOptIn) {
    const record = records[command];
    if (!record)
        return { available: false, reason: 'unknown-capability' };
    if (!record.implemented || record.lifecycle === 'planned')
        return { available: false, reason: 'unimplemented' };
    if (record.lifecycle === 'removed')
        return { available: false, reason: 'removed' };
    if (record.lifecycle === 'experimental' && !experimentalOptIn)
        return { available: false, reason: 'experimental-opt-in-required' };
    if (record.lifecycle === 'deprecated') {
        const deprecation = record.deprecation;
        const warning = deprecation
            ? `Vectalon: ${command} is deprecated since ${deprecation.noticeVersion}. Migrate via ${deprecation.migrationReference}. Remove in ${deprecation.removalVersion}. ${deprecation.licenseEffect}`
            : `Vectalon: ${command} is deprecated.`;
        return { available: true, reason: 'deprecated', warning };
    }
    return { available: true, reason: 'available' };
}
function extensionCommandDecision(command, experimentalOptIn) {
    return extensionCommandDecisionFrom(statuses, command, experimentalOptIn);
}
function extensionCommandLabel(command) {
    return `[${statuses[command]?.lifecycle ?? 'unregistered'}]`;
}
//# sourceMappingURL=capabilityAvailability.js.map