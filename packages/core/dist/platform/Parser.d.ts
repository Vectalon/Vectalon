/**
 * Parser interface for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface Parser {
    parse(file: SourceFile): Promise<ASTNode>;
    walk(ast: ASTNode, visitor: NodeVisitor): void;
    query(ast: ASTNode, selector: string): ASTNode[];
}
export interface SourceFile {
    path: string;
    content: string;
    language: string;
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
