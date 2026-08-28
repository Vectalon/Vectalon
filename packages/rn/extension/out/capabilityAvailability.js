"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extensionCommandDecision = extensionCommandDecision;
exports.extensionCommandLabel = extensionCommandLabel;
const capability_status_generated_json_1 = __importDefault(require("./capability-status.generated.json"));
const statuses = capability_status_generated_json_1.default;
function extensionCommandDecision(command, experimentalOptIn) {
    const lifecycle = statuses[command];
    if (!lifecycle)
        return { available: false, reason: 'unknown-capability' };
    if (lifecycle === 'planned')
        return { available: false, reason: 'unimplemented' };
    if (lifecycle === 'removed')
        return { available: false, reason: 'removed' };
    if (lifecycle === 'experimental' && !experimentalOptIn)
        return { available: false, reason: 'experimental-opt-in-required' };
    return { available: true, reason: 'available' };
}
function extensionCommandLabel(command) {
    return `[${statuses[command] ?? 'unregistered'}]`;
}
//# sourceMappingURL=capabilityAvailability.js.map