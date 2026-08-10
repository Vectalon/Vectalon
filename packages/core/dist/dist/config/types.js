"use strict";
/**
 * Config types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTS = void 0;
exports.DEFAULTS = {
    modelProvider: 'local',
    modelConfig: {},
    agentProtocol: 'mcp',
    autoScan: true,
    learningEnabled: true,
    sdlcModules: ['component-gen', 'test-writer', 'debug-analyzer', 'lint-fixer'],
    embeddingProvider: 'hash',
};
