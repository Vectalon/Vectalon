export interface TaskInput {
  title: string
  description: string
  type?: string
  parentId?: string
  assignee?: string
  labels?: string[]
}

export interface Task {
  id: string
  title: string
  description: string
  url?: string
  status: string
}

/**
 * A ticket read from the project-management provider (Jira / GitHub / Monday)
 * for headless ticket-to-PR flows (`vectalon feature --ticket <key>`).
 */
export interface Ticket {
  key: string
  title: string
  description: string
  url?: string
  /** True when fetched from the live provider; false for the deterministic stub. */
  fetched: boolean
}

export interface ProjectManagementAdapter {
  name: string
  createTasks(tasks: TaskInput[]): Promise<Task[]>
  updateTasks(ids: string[], status: string): Promise<void>
  closeTasks(ids: string[]): Promise<void>
  /**
   * Read a ticket by key. Providers without credentials (or a deterministic
   * stub adapter) return a non-null stub ticket (fetched: false) so headless
   * ticket-to-PR flows stay runnable everywhere.
   */
  readTicket(key: string): Promise<Ticket | null>
}

export interface CommitInput {
  message: string
  files?: string[]
  allowEmpty?: boolean
}

export interface PullRequestInput {
  title: string
  body: string
  head: string
  base?: string
  draft?: boolean
}

export interface PullRequest {
  id: string
  number: number
  url: string
  title: string
}

export interface GitAdapter {
  name: string
  createBranch(name: string): Promise<void>
  commit(input: CommitInput): Promise<string>
  push(branch?: string): Promise<void>
  /**
   * Open a pull request. Returns null when the PR cannot be created (no
   * GITHUB_TOKEN, no `gh` CLI, no GitHub remote) instead of fabricating one.
   */
  createPullRequest(input: PullRequestInput): Promise<PullRequest | null>
  /** Post a review comment on an open pull request (e.g. the code-review summary). */
  commentPullRequest(number: number, body: string): Promise<void>
  /**
   * Post or update a PR comment identified by a unique marker (e.g.
   * `<!-- vectalon-visual-ci -->`) so repeated runs upsert one comment
   * instead of spamming the thread. Falls back to a fresh comment when the
   * provider cannot edit (no token, gh CLI only).
   */
  upsertPullRequestComment(number: number, marker: string, body: string): Promise<void>
}

export interface TestOptions {
  pattern?: string
  coverage?: boolean
  watch?: boolean
}

export interface TestResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  summary?: string
}

export interface TestRunnerAdapter {
  name: string
  runTests(options?: TestOptions): Promise<TestResult>
  runLint?(): Promise<TestResult>
  runPrettier?(): Promise<TestResult>
  runTypeCheck?(): Promise<TestResult>
}

export interface SimulatorOptions {
  platform: 'ios' | 'android'
  device?: string
  scheme?: string
  build?: boolean
}

export interface SimulatorResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export interface SimulatorAdapter {
  name: string
  run(options: SimulatorOptions): Promise<SimulatorResult>
}

export interface MotionRecommendation {
  element: string
  intent: string
  primaryProperty: string
  secondaryProperties: string[]
  duration: number
  easing: string
  personality: 'playful' | 'premium' | 'corporate' | 'energetic'
  notes: string
}

export interface DesignAdapter {
  name: string
  analyzeMotion(designSpec: string): Promise<MotionRecommendation[]>
}

export interface AdapterRegistry {
  projectManagement: ProjectManagementAdapter
  git: GitAdapter
  testRunner: TestRunnerAdapter
  simulator: SimulatorAdapter
  design: DesignAdapter
}

export interface WorkflowArtifact {
  type: string
  title: string
  content: string
  path?: string
}

export interface PhaseResult {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output: string
  artifacts: WorkflowArtifact[]
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface WorkflowState {
  id: string
  workflowId: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  phases: PhaseResult[]
  createdAt: number
  updatedAt: number
}

export type HealDecision = 'accept' | 'reject' | 'retry'

export interface HealFixInfo {
  file: string
  currentContent: string
  fixedContent: string
  findings: Array<{ severity: string; rule: string; message: string; line: number; suggestion?: string }>
}

export interface WorkflowContext {
  projectRoot: string
  snapshot: import('../harness/types').ContextSnapshot | null
  prompt: string
  inputs: Record<string, unknown>
  outputs: Record<string, string>
  state: WorkflowState
  adapters: AdapterRegistry
  modelRouter: import('../model/ModelRouter').ModelRouter
  deviceRun?: boolean
  /**
   * Optional interactive hook for the self-healing review loop. When set, the
   * code-review phase asks this callback before applying each model fix and
   * honors accept / reject / retry. When unset, fixes are applied automatically.
   */
  onHealFix?: (info: HealFixInfo) => Promise<HealDecision> | HealDecision
}

export interface WorkflowPhase {
  id: string
  name: string
  description: string
  run: (ctx: WorkflowContext) => Promise<PhaseResult>
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  phases: WorkflowPhase[]
}

export interface WorkflowRegistry {
  [id: string]: WorkflowDefinition
}
