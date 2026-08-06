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
exports.KnowledgeNode = exports.KnowledgeTreeProvider = void 0;
exports.openArtifact = openArtifact;
const vscode = __importStar(require("vscode"));
const webview_1 = require("./webview");
const output_1 = require("./output");
/**
 * Sidebar tree of the team knowledge base: artifact types as parent nodes,
 * artifacts as children. Clicking an artifact fetches its full content and
 * renders it in the preview panel.
 */
class KnowledgeTreeProvider {
    client;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    artifacts = [];
    loading = false;
    constructor(client) {
        this.client = client;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // Root: fetch once, group by artifact type.
            await this.loadArtifacts();
            const byType = new Map();
            for (const artifact of this.artifacts) {
                const list = byType.get(artifact.type) || [];
                list.push(artifact);
                byType.set(artifact.type, list);
            }
            return [...byType.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([type, items]) => groupNode(type, items));
        }
        return element.children || [];
    }
    async loadArtifacts() {
        if (this.loading)
            return;
        this.loading = true;
        try {
            const raw = await this.client.callTool('list_artifacts');
            const parsed = JSON.parse(raw.content);
            if (Array.isArray(parsed)) {
                this.artifacts = parsed;
            }
        }
        catch (err) {
            this.artifacts = [];
            (0, output_1.log)(`list_artifacts failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            this.loading = false;
        }
    }
}
exports.KnowledgeTreeProvider = KnowledgeTreeProvider;
class KnowledgeNode extends vscode.TreeItem {
    label;
    kind;
    artifact;
    children;
    constructor(label, kind, artifact, children = []) {
        super(label, children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.kind = kind;
        this.artifact = artifact;
        this.children = children;
        if (kind === 'artifact') {
            this.iconPath = new vscode.ThemeIcon('file-text');
            this.tooltip = artifact ? `${artifact.title}\n(${artifact.type})` : label;
            this.command = {
                command: 'vectalon.openArtifact',
                title: 'Open artifact',
                arguments: [artifact],
            };
        }
        else {
            this.iconPath = new vscode.ThemeIcon('library');
            this.tooltip = `${children.length} artifact(s)`;
        }
    }
}
exports.KnowledgeNode = KnowledgeNode;
function groupNode(type, items) {
    const children = items
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .map(item => new KnowledgeNode(item.title, 'artifact', item));
    return new KnowledgeNode(type, 'group', null, children);
}
/** Open an artifact's full content in the preview panel. */
async function openArtifact(client, artifact) {
    if (!artifact)
        return;
    const raw = await client.callTool('get_artifact', { id: artifact.id });
    let content = raw.content;
    try {
        const parsed = JSON.parse(raw.content);
        content = parsed.content || raw.content;
    }
    catch {
        // Raw content is already the display text.
    }
    webview_1.PreviewPanel.show(artifact.title || 'Artifact', content);
}
//# sourceMappingURL=knowledgeTree.js.map