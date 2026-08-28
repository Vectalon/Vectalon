"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const client_1 = require("./client");
const serverManager_1 = require("./serverManager");
const guardrails_1 = require("./guardrails");
const knowledgeTree_1 = require("./knowledgeTree");
const commands_1 = require("./commands");
const output_1 = require("./output");
const capabilityAvailability_1 = require("./capabilityAvailability");
let server = null;
let statusBar = null;
let treeProvider = null;
let reconnectTimer = null;
let connecting = false;
/** How often the background loop re-probes a dropped server (P0-8). */
const RECONNECT_INTERVAL_MS = 30_000;
async function activate(context) {
    (0, output_1.log)('Vectalon extension activating');
    const config = vscode.workspace.getConfiguration('vectalon');
    const baseUrl = config.get('url') || 'http://localhost:8765';
    const autoStart = config.get('autoStart', true);
    const guardrailsOnSave = config.get('guardrailsOnSave', true);
    const outputChannel = (0, output_1.getOutputChannel)();
    context.subscriptions.push(outputChannel);
    // Status bar: connection state + last guardrail summary.
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(plug) Vectalon';
    statusBar.tooltip = 'Vectalon MCP server status. Click to start the server.';
    statusBar.command = 'vectalon.startServer';
    statusBar.show();
    context.subscriptions.push(statusBar);
    const diagnostics = vscode.languages.createDiagnosticCollection('vectalon-guardrails');
    context.subscriptions.push(diagnostics);
    const guardrails = (0, guardrails_1.createGuardrailRunner)(new client_1.McpHttpClient(baseUrl), diagnostics);
    const tree = new knowledgeTree_1.KnowledgeTreeProvider(new client_1.McpHttpClient(baseUrl));
    treeProvider = tree;
    context.subscriptions.push(vscode.window.createTreeView('vectalon.knowledgeView', { treeDataProvider: tree }));
    (0, commands_1.registerCommands)(context, () => server?.client ?? null, guardrails, tree);
    const registerCapabilityCommand = (command, callback, thisArg) => vscode.commands.registerCommand(command, async (...args) => {
        const experimental = vscode.workspace.getConfiguration('vectalon').get('experimentalCapabilities', false);
        const decision = (0, capabilityAvailability_1.extensionCommandDecision)(command, experimental);
        if (!decision.available) {
            void vscode.window.showWarningMessage(`Vectalon: ${command} unavailable (${decision.reason}). Experimental access does not grant paid entitlements.`);
            return;
        }
        if (decision.warning)
            void vscode.window.showWarningMessage(decision.warning);
        return callback.apply(thisArg, args);
    });
    // Start / stop MCP server commands (also the status-bar fallback).
    context.subscriptions.push(registerCapabilityCommand('vectalon.startServer', async () => {
        await connect(baseUrl, autoStart);
    }), registerCapabilityCommand('vectalon.restartServer', async () => {
        await restartServer(baseUrl, autoStart);
    }), registerCapabilityCommand('vectalon.stopServer', () => {
        disconnect();
    }));
    // Inline guardrail status: run on the active file when it changes / saves.
    if (guardrailsOnSave) {
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && (0, guardrails_1.isCheckableFile)(editor.document.uri)) {
                void guardrails.run(editor.document.uri);
            }
        }), vscode.workspace.onDidSaveTextDocument(document => {
            if ((0, guardrails_1.isCheckableFile)(document.uri)) {
                void guardrails.run(document.uri);
            }
        }), vscode.workspace.onDidCloseTextDocument(document => {
            guardrails.clear(document.uri);
        }));
    }
    // Connect at startup: reachable server wins; otherwise auto-start the CLI
    // with retries. The background loop keeps the connection alive afterwards
    // (e.g. after laptop sleep).
    await connect(baseUrl, autoStart);
    startReconnectLoop(baseUrl, autoStart);
    (0, output_1.log)('Vectalon extension activated');
}
/**
 * Establish a connection. A reachable server wins; otherwise (autoStart) the
 * CLI is spawned with up to 3 attempts and exponential backoff. On total
 * failure an error notification offers Retry / Restart Server. Background
 * attempts (`silent`) log instead of notifying so the reconnect loop never
 * spams the user.
 */
async function connect(baseUrl, autoStart, silent = false) {
    if (server || connecting)
        return;
    connecting = true;
    try {
        updateStatus(false, 'connecting…');
        const probe = new client_1.McpHttpClient(baseUrl);
        if (await (0, serverManager_1.isReachable)(probe)) {
            server = { client: probe, baseUrl, child: null, stop: () => undefined };
            onConnected();
            // Deep health (P0-4): surface healthy | degraded | critical + the failing
            // checks in the status-bar tooltip, best-effort. Guarded so a slow health
            // response can never flip the status bar back to "connected" after the
            // user has disconnected.
            void probe.getHealth().then((health) => {
                if (health && server?.client === probe)
                    updateStatus(true, '', health);
            });
            return;
        }
        if (!autoStart) {
            updateStatus(false, '');
            if (!silent) {
                void vscode.window.showWarningMessage(`Vectalon server not reachable at ${baseUrl}. Run \`vectalon serve --protocol http\` or enable vectalon.autoStart.`);
            }
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        updateStatus(false, 'starting…');
        try {
            // P0-8: 3 spawn attempts with exponential backoff (1s, 2s) instead of a
            // single 20s try-and-give-up.
            server = await (0, serverManager_1.spawnServerWithRetry)(workspaceRoot, (0, serverManager_1.portFromUrl)(baseUrl));
            onConnected();
        }
        catch (err) {
            server = null;
            const message = err instanceof Error ? err.message : String(err);
            (0, output_1.log)(`Failed to start vectalon serve: ${message}`);
            if (silent) {
                updateStatus(false, 'offline (reconnect pending)');
                return;
            }
            // Release the lock before the notification resolves so the Retry /
            // Restart Server actions actually run instead of bouncing off the
            // `connecting` guard (the finally below is too late for them).
            connecting = false;
            const action = await vscode.window.showErrorMessage(`Vectalon: could not start the MCP server — ${message}`, 'Retry', 'Restart Server');
            if (action === 'Retry') {
                await connect(baseUrl, autoStart);
            }
            else if (action === 'Restart Server') {
                await restartServer(baseUrl, autoStart);
            }
        }
    }
    finally {
        connecting = false;
    }
}
/** Kill any child process and re-establish the connection. */
async function restartServer(baseUrl, autoStart) {
    if (server) {
        server.stop();
        server = null;
    }
    updateStatus(false, 'restarting…');
    await connect(baseUrl, autoStart);
}
/**
 * Background reconnect loop (P0-8): every 30s, if the server is unreachable
 * (dropped, laptop sleep, port taken over), attempt a silent reconnect. Stops
 * when the user explicitly stops the server or the extension deactivates.
 */
function startReconnectLoop(baseUrl, autoStart) {
    if (reconnectTimer)
        return;
    reconnectTimer = setInterval(() => {
        void (async () => {
            if (connecting)
                return;
            // Re-read the config each tick so url/autoStart changes take effect
            // without a window reload.
            const config = vscode.workspace.getConfiguration('vectalon');
            const liveBaseUrl = config.get('url') || baseUrl;
            const liveAutoStart = config.get('autoStart', autoStart);
            if (server) {
                const alive = await server.client.pingQuick(3_000);
                if (alive)
                    return;
                (0, output_1.log)('Vectalon server dropped (sleep/wake or process exit) — reconnecting');
                server.stop();
                server = null;
            }
            await connect(liveBaseUrl, liveAutoStart, true);
        })();
    }, RECONNECT_INTERVAL_MS);
}
function stopReconnectLoop() {
    if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
    }
}
function disconnect() {
    stopReconnectLoop();
    server?.stop();
    server = null;
    updateStatus(false, '');
    void vscode.window.showInformationMessage('Vectalon MCP server stopped');
}
function onConnected() {
    updateStatus(true, '');
    treeProvider?.refresh();
    void vscode.window.showInformationMessage(`Vectalon connected at ${server?.baseUrl || 'http://localhost'}`, 'Open knowledge base').then(choice => {
        if (choice === 'Open knowledge base') {
            void vscode.commands.executeCommand('vectalon.knowledgeView.focus');
        }
    });
}
function updateStatus(connected, detail, health) {
    void vscode.commands.executeCommand('setContext', 'vectalon.connected', connected);
    if (!statusBar)
        return;
    statusBar.text = connected ? '$(plug) Vectalon' : '$(plug) Vectalon (offline)';
    let tooltip = connected
        ? `Connected to ${server?.baseUrl || 'http://localhost'}`
        : `Vectalon MCP server is ${detail || 'offline'}. Click to start it.`;
    if (connected && health) {
        tooltip += `\nHealth: ${health.status}`;
        const failing = health.checks.filter(c => c.status !== 'ok');
        for (const check of failing.slice(0, 4)) {
            tooltip += `\n  ${check.status === 'fail' ? '✖' : '⚠'} ${check.name}: ${check.detail}`;
        }
    }
    statusBar.tooltip = tooltip;
    statusBar.command = connected ? 'vectalon.projectContext' : 'vectalon.startServer';
}
function deactivate() {
    stopReconnectLoop();
    disconnect();
    (0, output_1.disposeOutputChannel)();
}
//# sourceMappingURL=extension.js.map