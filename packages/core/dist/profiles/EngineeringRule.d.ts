/**
 * EngineeringRule — Machine-readable rule abstraction
 * Business Source License 1.1 (BSL-1.1)
 *
 * Replaces arbitrary string rule ids with a structured, machine-readable
 * rule model. Each rule carries metadata, severity, category, optional
 * detection strategy, and optional remediation guidance.
 *
 * Detection strategies:
 *   AST, Regex, StaticAnalysis, BuildConfig, TestCoverage, Composite
 *
 * Remediation strategies:
 *   AutoFix, Guidance, Snippet, Manual
 */
import type { SourceFile, Parser, GuardrailFinding } from '../platform/GuardrailEngine';
export type RuleSeverity = 'info' | 'warning' | 'error' | 'block';
export type RuleCategory = 'style' | 'architecture' | 'security' | 'performance' | 'compatibility' | 'correctness';
export interface EngineeringRule {
    id: string;
    version: string;
    name: string;
    severity: RuleSeverity;
    category: RuleCategory;
    description: string;
    appliesTo?: string[];
    detection?: DetectionStrategy;
    remediation?: RemediationStrategy;
    tags?: string[];
    docs?: string;
    autoFixable?: boolean;
    check: (file: SourceFile, parser: Parser) => GuardrailFinding[];
}
export type DetectionStrategy = ASTDetection | RegexDetection | StaticAnalysisDetection | BuildConfigDetection | TestCoverageDetection | CompositeDetection;
export interface ASTDetection {
    type: 'ast';
    parser: string;
    selector?: string;
    matchDescription?: string;
}
export interface RegexDetection {
    type: 'regex';
    pattern: string;
    flags?: string;
    matchMeaning: 'violate' | 'comply';
}
export interface StaticAnalysisDetection {
    type: 'static-analysis';
    tool: string;
    toolRuleId: string;
    config?: string;
}
export interface BuildConfigDetection {
    type: 'build-config';
    buildSystem: string;
    filePattern: string;
    checkDescription: string;
}
export interface TestCoverageDetection {
    type: 'test-coverage';
    framework: string;
    sourcePattern: string;
    testPattern: string;
    minCoverage?: number;
}
export interface CompositeDetection {
    type: 'composite';
    all?: DetectionStrategy[];
    any?: DetectionStrategy[];
}
export type RemediationStrategy = AutoFixRemediation | GuidanceRemediation | SnippetRemediation | ManualRemediation;
export interface AutoFixRemediation {
    type: 'auto-fix';
    description: string;
    transform: string;
    safe: boolean;
}
export interface GuidanceRemediation {
    type: 'guidance';
    steps: string[];
    example?: string;
}
export interface SnippetRemediation {
    type: 'snippet';
    code: string;
    language?: string;
    description: string;
}
export interface ManualRemediation {
    type: 'manual';
    reason: string;
    suggestion?: string;
}
export declare function createRule(id: string, severity: RuleSeverity, category: RuleCategory, description: string, overrides?: Partial<Omit<EngineeringRule, 'id' | 'severity' | 'category' | 'description'>>): EngineeringRule;
export declare function isASTDetection(s: DetectionStrategy): s is ASTDetection;
export declare function isRegexDetection(s: DetectionStrategy): s is RegexDetection;
export declare function isStaticAnalysisDetection(s: DetectionStrategy): s is StaticAnalysisDetection;
export declare function isBuildConfigDetection(s: DetectionStrategy): s is BuildConfigDetection;
export declare function isTestCoverageDetection(s: DetectionStrategy): s is TestCoverageDetection;
export declare function isCompositeDetection(s: DetectionStrategy): s is CompositeDetection;
export declare function isAutoFixRemediation(s: RemediationStrategy): s is AutoFixRemediation;
export declare function isGuidanceRemediation(s: RemediationStrategy): s is GuidanceRemediation;
export declare function isSnippetRemediation(s: RemediationStrategy): s is SnippetRemediation;
export declare function isManualRemediation(s: RemediationStrategy): s is ManualRemediation;
