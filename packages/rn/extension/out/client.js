"use strict";
/**
 * Minimal HTTP client for the vectalon MCP server (`vectalon serve
 * --protocol http`). Talks JSON over the existing REST surface — no new
 * backend: GET /tools for discovery, POST /call for tool invocation.
 *
 * Deliberately free of any `vscode` import so the module is unit-testable in
 * the host repo and reusable from web dashboards / JetBrains plugins.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpHttpClient = void 0;
const DEFAULT_TIMEOUT_MS = 15_000;
class McpHttpClient {
    baseUrl;
    fetchImpl;
    timeoutMs;
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.fetchImpl = options.fetch || globalThis.fetch;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    /** GET /tools — true when the server is reachable and MCP is running. */
    async ping() {
        try {
            const tools = await this.listTools();
            return Array.isArray(tools);
        }
        catch {
            return false;
        }
    }
    /** GET /tools — the advertised tool list. */
    async listTools() {
        const data = await this.request('/tools', { method: 'GET' });
        if (!data || !Array.isArray(data.tools)) {
            throw new Error('Unexpected /tools response shape');
        }
        return data.tools;
    }
    /** POST /call — invoke a tool with the given arguments. */
    async callTool(name, args = {}) {
        const data = await this.request('/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, arguments: args }),
        });
        if (!data || typeof data.content !== 'string') {
            throw new Error(`Unexpected /call response for tool "${name}"`);
        }
        return data;
    }
    async request(path, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                ...init,
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`${path} failed with HTTP ${response.status}`);
            }
            return (await response.json());
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.McpHttpClient = McpHttpClient;
//# sourceMappingURL=client.js.map