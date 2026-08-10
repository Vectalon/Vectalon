/**
 * GuardrailEngine interface for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface GuardrailEngine {
    registerRule(rule: GuardrailRule): void;
    checkFile(file: SourceFile, parser: Parser): Promise<GuardrailFinding[]>;
}
export interface GuardrailRule {
    id: string;
    name: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
    appliesTo: string[];
    check: (file: SourceFile, parser: Parser) => GuardrailFinding[];
}
export interface GuardrailFinding {
    ruleId: string;
    message: string;
    line?: number;
    column?: number;
    filePath?: string;
    severity: 'error' | 'warning' | 'info';
}
export interface SourceFile {
    path: string;
    content: string;
    language: string;
}
export interface Parser {
    parse(file: SourceFile): Promise<ASTNode>;
    walk(ast: ASTNode, visitor: NodeVisitor): void;
    query(ast: ASTNode, selector: string): ASTNode[];
}
export interface ASTNode {
    type: string;
    start: number;
    end: number;
    children: ASTNode[];
    [key: string]: unknown;
}
export interface NodeVisitor {
    enter?: (node: ASTNode, parent: ASTNode | null) => void;
    exit?: (node: ASTNode, parent: ASTNode | null) => void;
}
