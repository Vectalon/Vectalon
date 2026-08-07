/**
 * Analyzer interface for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface Analyzer {
    readonly id: string;
    readonly appliesTo: string[];
    analyze(file: SourceFile, parser: Parser): Promise<AnalysisResult>;
}
export interface AnalysisResult {
    findings: Finding[];
    graph: KnowledgeGraph;
    metrics: CodeMetrics;
}
export interface Finding {
    id: string;
    message: string;
    line?: number;
    severity: 'error' | 'warning' | 'info';
}
export interface KnowledgeGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}
export interface GraphNode {
    id: string;
    type: string;
    label: string;
}
export interface GraphEdge {
    from: string;
    to: string;
    type: string;
}
export interface CodeMetrics {
    linesOfCode: number;
    complexity: number;
    duplication: number;
    testCoverage?: number;
}
export interface SourceFile {
    path: string;
    content: string;
    language: string;
}
export interface Parser {
    parse(file: SourceFile): Promise<import('./Parser').ASTNode>;
    walk(ast: import('./Parser').ASTNode, visitor: import('./Parser').NodeVisitor): void;
    query(ast: import('./Parser').ASTNode, selector: string): import('./Parser').ASTNode[];
}
