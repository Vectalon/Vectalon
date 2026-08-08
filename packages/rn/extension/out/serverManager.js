"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseUrlFromPort = exports.portFromUrl = void 0;
exports.isReachable = isReachable;
exports.spawnServerWithRetry = spawnServerWithRetry;
exports.spawnServer = spawnServer;
const child_process_1 = require("child_process");
const client_1 = require("./client");
const urls_1 = require("./urls");
Object.defineProperty(exports, "portFromUrl", { enumerable: true, get: function () { return urls_1.portFromUrl; } });
Object.defineProperty(exports, "baseUrlFromPort", { enumerable: true, get: function () { return urls_1.baseUrlFromPort; } });
const retry_1 = require("./retry");
const output_1 = require("./output");
/**
 * Manages the `vectalon serve --protocol http` child process. The extension
 * prefers an already-running server (config `vectalon.url`); when none is
 * reachable and `vectalon.autoStart` is on, it spawns the CLI in the current
 * workspace and waits for the port banner before reporting connected.
 */
const PORT_BANNER = /rn-vectalon MCP server running on port (\d+)/;
/** True when a server is reachable at the URL. */
async function isReachable(client) {
    return client.ping();
}
const SPAWN_TIMEOUT_MS = 20_000;
const DEFAULT_SPAWN_ATTEMPTS = 3;
/**
 * Spawn `vectalon serve --protocol http --port <port>` with retries (P0-8):
 * up to `attempts` tries with exponential backoff (1s, 2s, …). A flaky first
 * spawn (port race, slow bundler init) no longer leaves the extension dead.
 */
function spawnServerWithRetry(workspaceRoot, port, options = {}) {
    const attempts = options.attempts ?? DEFAULT_SPAWN_ATTEMPTS;
    const logger = options.log || output_1.log;
    return (0, retry_1.withRetries)(() => spawnServer(workspaceRoot, port), {
        attempts,
        baseMs: 1_000,
        label: `spawning vectalon serve on port ${port}`,
        log: logger,
    });
}
/**
 * Spawn `vectalon serve --protocol http --port <port>` in the workspace and
 * wait until the port banner appears (or the process exits / times out).
 */
function spawnServer(workspaceRoot, port, extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)('vectalon', ['serve', '--protocol', 'http', '--port', String(port)], {
            cwd: workspaceRoot,
            env: { ...process.env, ...extraEnv, NODE_ENV: 'development' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let settled = false;
        const finish = (err, handle) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            child.stderr?.off('data', onStderr);
            child.off('exit', onExit);
            if (err)
                reject(err);
            else
                resolve(handle);
        };
        const onStderr = (data) => {
            const text = data.toString();
            (0, output_1.log)(`[serve] ${text.trimEnd()}`);
            if (PORT_BANNER.test(text) && !settled) {
                const baseUrl = (0, urls_1.baseUrlFromPort)(port);
                finish(null, {
                    client: new client_1.McpHttpClient(baseUrl),
                    baseUrl,
                    child,
                    stop() {
                        finish(null);
                        child.kill();
                    },
                });
            }
        };
        const onExit = (code, signal) => {
            finish(new Error(`vectalon serve exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`));
        };
        const timer = setTimeout(() => {
            finish(new Error(`Timed out waiting for vectalon serve on port ${port}`));
        }, SPAWN_TIMEOUT_MS);
        child.stderr?.on('data', onStderr);
        child.once('exit', onExit);
    });
}
//# sourceMappingURL=serverManager.js.map