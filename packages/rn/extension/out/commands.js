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
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const webview_1 = require("./webview");
const knowledgeTree_1 = require("./knowledgeTree");
const output_1 = require("./output");
const capabilityAvailability_1 = require("./capabilityAvailability");
/** Register every Vectalon command palette workflow. */
function registerCommands(context, getClient, guardrails, knowledgeTree) {
    const registerCapabilityCommand = (command, callback, thisArg) => vscode.commands.registerCommand(command, async (...args) => {
        const experimental = vscode.workspace.getConfiguration('vectalon').get('experimentalCapabilities', false);
        const decision = (0, capabilityAvailability_1.extensionCommandDecision)(command, experimental);
        if (!decision.available) {
            void vscode.window.showWarningMessage(`Vectalon: ${command} unavailable (${decision.reason}). Experimental access does not grant paid entitlements.`);
            return;
        }
        return callback.apply(thisArg, args);
    });
    const requireClient = () => {
        const client = getClient();
        if (!client) {
            void vscode.window.showWarningMessage('Vectalon server is not connected. Run "Vectalon: Start MCP Server".');
        }
        return client;
    };
    const withClient = async (fn) => {
        const client = requireClient();
        if (!client)
            return;
        try {
            await fn(client);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            (0, output_1.log)(`Command failed: ${message}`);
            void vscode.window.showErrorMessage(`Vectalon: ${message}`);
        }
    };
    context.subscriptions.push(registerCapabilityCommand('vectalon.runFeatureWorkflow', () => withClient(async (client) => {
        const prompt = await vscode.window.showInputBox({
            prompt: 'Describe the feature to build',
            placeHolder: 'e.g. Add a login screen with email + password',
        });
        if (!prompt)
            return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Vectalon: running feature workflow…' }, async () => {
            const result = await client.callTool('execute_workflow', {
                workflowId: 'feature-development',
                prompt,
            });
            webview_1.PreviewPanel.show('Feature Workflow', result.content);
        });
    })), registerCapabilityCommand('vectalon.reviewCode', () => withClient(async (client) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const result = await client.callTool('review_code', {
            code: editor.document.getText(),
            language: editor.document.languageId,
            filename: editor.document.fileName,
        });
        webview_1.PreviewPanel.show('Code Review', result.content);
    })), registerCapabilityCommand('vectalon.checkGuardrails', () => withClient(async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        await guardrails.run(editor.document.uri);
        void vscode.window.showInformationMessage(`Vectalon: ${guardrails.lastSummary()}`);
    })), registerCapabilityCommand('vectalon.generateComponent', () => withClient(async (client) => {
        const name = await vscode.window.showInputBox({
            prompt: 'Component name (PascalCase)',
            placeHolder: 'e.g. ProfileCard',
        });
        if (!name)
            return;
        const result = await client.callTool('generate_component', { name });
        webview_1.PreviewPanel.show(name, result.content);
    })), registerCapabilityCommand('vectalon.archiveBuild', () => withClient(async (client) => {
        const flavor = await vscode.window.showInputBox({
            prompt: 'Build flavor (leave empty for auto-detect)',
            placeHolder: 'e.g. staging',
        });
        if (flavor === undefined)
            return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Vectalon: archiving build…' }, async () => {
            const result = await client.callTool('archive_build', { flavor: flavor || undefined });
            webview_1.PreviewPanel.show('Archive Build', result.content);
        });
    })), registerCapabilityCommand('vectalon.distributeBuild', () => withClient(async (client) => {
        const target = await vscode.window.showQuickPick(['testflight', 'play-store', 'saas', 'portal'], {
            placeHolder: 'Distribution target (dry-run plan by default)',
        });
        if (!target)
            return;
        const result = await client.callTool('distribute_build', { target });
        webview_1.PreviewPanel.show(`Distribute → ${target}`, result.content);
    })), registerCapabilityCommand('vectalon.shareBuild', () => withClient(async (client) => {
        const result = await client.callTool('share_build_locally', {});
        webview_1.PreviewPanel.show('Share Build', result.content);
    })), registerCapabilityCommand('vectalon.generatePortal', () => withClient(async (client) => {
        const branding = await vscode.window.showInputBox({
            prompt: 'Portal branding (title)',
            placeHolder: 'e.g. Acme Builds',
        });
        const result = await client.callTool('generate_portal', { branding: branding || undefined });
        webview_1.PreviewPanel.show('Build Portal', result.content);
    })), registerCapabilityCommand('vectalon.projectContext', () => withClient(async (client) => {
        const result = await client.callTool('get_project_context');
        webview_1.PreviewPanel.show('Project Context', result.content);
    })), registerCapabilityCommand('vectalon.searchKnowledge', () => withClient(async (client) => {
        const query = await vscode.window.showInputBox({
            prompt: 'Search the team knowledge base',
            placeHolder: 'e.g. navigation patterns',
        });
        if (!query)
            return;
        const result = await client.callTool('search_knowledge', { query });
        webview_1.PreviewPanel.show(`Search: ${query}`, result.content);
    })), registerCapabilityCommand('vectalon.refreshKnowledge', () => {
        knowledgeTree.refresh();
    }), registerCapabilityCommand('vectalon.openArtifact', (artifact) => withClient(async (client) => {
        await (0, knowledgeTree_1.openArtifact)(client, artifact);
    })));
}
//# sourceMappingURL=commands.js.map