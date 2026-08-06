/**
 * Platform interfaces for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 * 
 * These interfaces define contracts that each product (rn, ios, android, python)
 * must implement using their language-native parsers and analyzers.
 */

/**
 * Scanner — Detects project type and structure
 */
export interface Scanner {
  scanProject(root: string): Promise<ProjectSnapshot>
  detectTooling(root: string): string
}

export interface ProjectSnapshot {
  name: string
  version: string
  tooling: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  files: string[]
  language: string
}

/**
 * ContextEngine — Assembles language-specific prompts
 */
export interface ContextEngine {
  buildPrompt(options: PromptOptions): string
}

export interface PromptOptions {
  project: ProjectSnapshot
  feature: string
  [key: string]: unknown
}

/**
 * GuardrailEngine — Checks code quality
 */
export interface GuardrailEngine {
  registerRule(rule: GuardrailRule): void
  checkFile(file: SourceFile, parser: Parser): Promise<GuardrailFinding[]>
}

export interface GuardrailRule {
  id: string
  name: string
  description: string
  severity: 'error' | 'warning' | 'info'
  appliesTo: string[]
  check: (file: SourceFile, parser: Parser) => GuardrailFinding[]
}

export interface GuardrailFinding {
  ruleId: string
  message: string
  line?: number
  column?: number
  filePath?: string
  severity: 'error' | 'warning' | 'info'
}

/**
 * Parser — Language-specific AST parser
 */
export interface Parser {
  parse(file: SourceFile): Promise<ASTNode>
  walk(ast: ASTNode, visitor: NodeVisitor): void
  query(ast: ASTNode, selector: string): ASTNode[]
}

export interface SourceFile {
  path: string
  content: string
  language: string
}

export interface ASTNode {
  type: string
  start: number
  end: number
  children: ASTNode[]
  [key: string]: unknown
}

export interface NodeVisitor {
  enter?: (node: ASTNode, parent: ASTNode | null) => void
  exit?: (node: ASTNode, parent: ASTNode | null) => void
}

/**
 * Analyzer — Deep code analysis
 */
export interface Analyzer {
  readonly id: string
  readonly appliesTo: string[]
  analyze(file: SourceFile, parser: Parser): Promise<AnalysisResult>
}

export interface AnalysisResult {
  findings: Finding[]
  graph: KnowledgeGraph
  metrics: CodeMetrics
}

export interface Finding {
  id: string
  message: string
  line?: number
  severity: 'error' | 'warning' | 'info'
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphNode {
  id: string
  type: string
  label: string
}

export interface GraphEdge {
  from: string
  to: string
  type: string
}

export interface CodeMetrics {
  linesOfCode: number
  complexity: number
  duplication: number
  testCoverage?: number
}
