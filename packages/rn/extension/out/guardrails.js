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
exports.createGuardrailRunner = createGuardrailRunner;
exports.isCheckableFile = isCheckableFile;
const vscode = __importStar(require("vscode"));
const guardrailResult_1 = require("./guardrailResult");
const retry_1 = require("./retry");
const output_1 = require("./output");
/** Debounce guardrail runs triggered by editor/save events. */
const RUN_DEBOUNCE_MS = 400;
/** Hard cap on a single guardrail check (P0-9) — never hang the editor. */
const RUN_TIMEOUT_MS = 3_000;
/** The single diagnostic emitted when a file cannot be analyzed (P0-9). */
const PARSE_FAILURE_MESSAGE = 'Vectalon: could not parse file';
function createGuardrailRunner(client, diagnostics) {
    let debounceTimer = null;
    let lastSummary = '';
    const setParseFailure = (uri) => {
        lastSummary = PARSE_FAILURE_MESSAGE;
        const range = new vscode.Range(0, 0, 0, 0);
        diagnostics.set(uri, [
            new vscode.Diagnostic(range, PARSE_FAILURE_MESSAGE, vscode.DiagnosticSeverity.Warning),
        ]);
    };
    const runNow = async (uri) => {
        let document;
        try {
            document = await vscode.workspace.openTextDocument(uri);
        }
        catch (err) {
            (0, output_1.log)(`Guardrails: could not open ${uri.fsPath}: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        try {
            // P0-8: fast availability pre-check (2s cap) — a down server skips
            // silently instead of blocking the editor on the default 15s timeout.
            if (!(await client.pingQuick())) {
                (0, output_1.log)(`Guardrails: server not reachable — skipping check for ${uri.fsPath} (non-blocking)`);
                return;
            }
            const content = document.getText();
            if (!content.trim()) {
                diagnostics.delete(uri);
                return;
            }
            // P0-9: a 3s cap on the request — a hung server check degrades to one
            // diagnostic, never a frozen editor or extension host.
            const raw = await (0, retry_1.withTimeout)(client.callTool('check_guardrails', {
                content,
                filePath: uri.fsPath,
            }), RUN_TIMEOUT_MS, 'guardrail check');
            const result = (0, guardrailResult_1.parseGuardrailResult)(raw.content);
            if (!result) {
                (0, output_1.log)(`Unparseable guardrail result for ${uri.fsPath}`);
                setParseFailure(uri);
                return;
            }
            const entries = [uri, []];
            for (const finding of (0, guardrailResult_1.failingFindings)(result)) {
                const line = Math.max(0, (finding.line || 1) - 1);
                const range = document.lineAt(Math.min(line, document.lineCount - 1)).range;
                entries[1].push(new vscode.Diagnostic(range, finding.message || finding.rule, (0, guardrailResult_1.severityToNumber)(finding.severity)));
            }
            lastSummary = (0, guardrailResult_1.summarize)(result);
            diagnostics.set(entries[0], entries[1]);
        }
        catch (err) {
            (0, output_1.log)(`Guardrail check failed: ${err instanceof Error ? err.message : String(err)}`);
            setParseFailure(uri);
        }
    };
    return {
        run(uri) {
            if (debounceTimer)
                clearTimeout(debounceTimer);
            return new Promise(resolve => {
                debounceTimer = setTimeout(() => {
                    void runNow(uri).then(resolve);
                }, RUN_DEBOUNCE_MS);
            });
        },
        clear(uri) {
            diagnostics.delete(uri);
        },
        lastSummary() {
            return lastSummary;
        },
    };
}
/** The file extensions that get inline guardrail checking. */
function isCheckableFile(uri) {
    return /\.[jt]sx?$/.test(uri.fsPath);
}
//# sourceMappingURL=guardrails.js.map