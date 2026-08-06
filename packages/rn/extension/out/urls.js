"use strict";
/** Pure URL helpers for the serve connection (vscode-free, unit-testable). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.portFromUrl = portFromUrl;
exports.baseUrlFromPort = baseUrlFromPort;
function portFromUrl(url) {
    try {
        const parsed = new URL(url);
        const port = Number(parsed.port);
        return Number.isFinite(port) && port > 0 ? port : 8765;
    }
    catch {
        return 8765;
    }
}
function baseUrlFromPort(port) {
    return `http://localhost:${port}`;
}
//# sourceMappingURL=urls.js.map