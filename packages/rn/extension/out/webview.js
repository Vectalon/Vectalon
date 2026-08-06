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
exports.PreviewPanel = void 0;
exports.renderMarkdown = renderMarkdown;
const vscode = __importStar(require("vscode"));
/** Render markdown-style tool output in a reusable webview panel. */
class PreviewPanel {
    panel;
    static current = null;
    constructor(panel) {
        this.panel = panel;
    }
    static show(title, content) {
        if (PreviewPanel.current) {
            PreviewPanel.current.panel.dispose();
            PreviewPanel.current = null;
        }
        const panel = vscode.window.createWebviewPanel('vectalon.preview', title, vscode.ViewColumn.Beside, { enableScripts: false, localResourceRoots: [] });
        panel.webview.html = renderHtml(title, content);
        panel.onDidDispose(() => {
            if (PreviewPanel.current?.panel === panel) {
                PreviewPanel.current = null;
            }
        });
        PreviewPanel.current = new PreviewPanel(panel);
    }
}
exports.PreviewPanel = PreviewPanel;
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/**
 * Minimal markdown-to-HTML: code fences, headings, lists, and bold — enough
 * for tool output without pulling in a markdown dependency.
 */
function renderMarkdown(markdown) {
    const lines = markdown.split('\n');
    const html = [];
    let inFence = false;
    for (const line of lines) {
        if (/^```/.test(line)) {
            inFence = !inFence;
            html.push(inFence ? '<pre>' : '</pre>');
            continue;
        }
        if (inFence) {
            html.push(escapeHtml(line));
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = Math.min(heading[1].length, 6);
            html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
            continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
            html.push(`<li>${escapeHtml(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
            continue;
        }
        if (line.trim() === '') {
            html.push('<br>');
            continue;
        }
        html.push(`<p>${escapeHtml(line)}</p>`);
    }
    return html.join('\n');
}
function renderHtml(title, content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
  h1, h2, h3 { color: var(--vscode-editor-foreground); }
  pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow-x: auto; }
  li { margin: 2px 0; }
</style>
<title>${escapeHtml(title)}</title>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${renderMarkdown(content)}
</body>
</html>`;
}
//# sourceMappingURL=webview.js.map