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
let server = null;
let statusBar = null;
let treeProvider = null;
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
    // Start MCP server command (also the status-bar fallback).
    context.subscriptions.push(vscode.commands.registerCommand('vectalon.startServer', async () => {
        await connect(baseUrl, autoStart);
    }), vscode.commands.registerCommand('vectalon.stopServer', () => {
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
    // Connect at startup: reachable server wins; otherwise auto-start the CLI.
    await connect(baseUrl, autoStart);
    (0, output_1.log)('Vectalon extension activated');
}
async function connect(baseUrl, autoStart) {
    if (server) {
        updateStatus(true, '');
        return;
    }
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
        void vscode.window.showWarningMessage(`Vectalon server not reachable at ${baseUrl}. Run \`vectalon serve --protocol http\` or enable vectalon.autoStart.`);
        return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    try {
        updateStatus(false, 'starting…');
        server = await (0, serverManager_1.spawnServer)(workspaceRoot, (0, serverManager_1.portFromUrl)(baseUrl));
        onConnected();
    }
    catch (err) {
        server = null;
        const message = err instanceof Error ? err.message : String(err);
        (0, output_1.log)(`Failed to start vectalon serve: ${message}`);
        void vscode.window.showWarningMessage(`Vectalon: could not start the MCP server — ${message}`);
    }
}
function disconnect() {
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
    disconnect();
    (0, output_1.disposeOutputChannel)();
}
//# sourceMappingURL=extension.js.map